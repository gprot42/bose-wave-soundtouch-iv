/*
 * upnp_display.c — Wave SoundTouch IV front-display text via :17000 telnet CLI
 *
 * Same mechanism as dlna-sender/send-display-text.py:
 *   abl rdset title "<text>"
 *   abl rdsend state
 */
#include "upnp_display.h"

#include <stdbool.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#define BOSE_TELNET_PORT     17000
#define BOSE_REST_PORT       8090
#define DISPLAY_IO_TIMEOUT   4
#define DISPLAY_CMD_WAIT_US  800000
#define DISPLAY_REFRESH_WAIT_US 500000

static const char *AUDIO_EXTENSIONS[] = {
    ".aac", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav", ".wma", NULL,
};

static bool has_audio_extension(const char *name)
{
    if (name == NULL)
        return false;

    size_t nlen = strlen(name);
    for (const char **ext = AUDIO_EXTENSIONS; *ext != NULL; ext++)
    {
        size_t elen = strlen(*ext);
        if (nlen > elen && strcasecmp(name + nlen - elen, *ext) == 0)
            return true;
    }
    return false;
}

void upnp_display_title_from_source(const char *source, char *out, size_t outlen)
{
    if (out == NULL || outlen == 0)
        return;

    out[0] = '\0';
    if (source == NULL || source[0] == '\0')
        return;

    const char *name = source;
    const char *slash = strrchr(source, '/');
    if (slash != NULL && slash[1] != '\0')
        name = slash + 1;

    char decoded[4096];
    const char *use = name;

    if (strstr(source, "%") != NULL)
    {
        size_t i = 0;
        const char *p = name;
        while (*p != '\0' && i + 1 < sizeof(decoded))
        {
            if (p[0] == '%' && p[1] != '\0' && p[2] != '\0')
            {
                char hex[3] = { p[1], p[2], '\0' };
                decoded[i++] = (char)strtol(hex, NULL, 16);
                p += 3;
                continue;
            }
            decoded[i++] = *p++;
        }
        decoded[i] = '\0';
        use = decoded;
    }

    if (has_audio_extension(use))
    {
        const char *dot = strrchr(use, '.');
        size_t len = dot != NULL ? (size_t)(dot - use) : strlen(use);
        if (len >= outlen)
            len = outlen - 1;
        memcpy(out, use, len);
        out[len] = '\0';
        return;
    }

    strncpy(out, use, outlen - 1);
    out[outlen - 1] = '\0';
}

static void escape_display_text(const char *in, char *out, size_t outlen)
{
    size_t j = 0;

    if (outlen == 0)
        return;

    if (in == NULL || in[0] == '\0')
    {
        out[0] = ' ';
        out[1] = '\0';
        return;
    }

    for (size_t i = 0; in[i] != '\0' && j + 1 < outlen; i++)
    {
        if (in[i] == '"')
            out[j++] = '\'';
        else
            out[j++] = in[i];
    }
    out[j] = '\0';
}

static int telnet_send_commands(const char *host, const char **commands, size_t ncmds)
{
    struct addrinfo hints = {
        .ai_family = AF_UNSPEC,
        .ai_socktype = SOCK_STREAM,
    };
    struct addrinfo *res = NULL;
    char portbuf[16];
    int sock = -1;
    int rc = -1;

    snprintf(portbuf, sizeof(portbuf), "%d", BOSE_TELNET_PORT);
    if (getaddrinfo(host, portbuf, &hints, &res) != 0 || res == NULL)
        return -1;

    sock = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sock < 0)
        goto done;

    struct timeval tv = { .tv_sec = DISPLAY_IO_TIMEOUT, .tv_usec = 0 };
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    if (connect(sock, res->ai_addr, res->ai_addrlen) != 0)
        goto done;

    char banner[4096];
    recv(sock, banner, sizeof(banner) - 1, 0);

    for (size_t i = 0; i < ncmds; i++)
    {
        char line[768];
        snprintf(line, sizeof(line), "%s\n", commands[i]);
        if (send(sock, line, strlen(line), 0) < 0)
            goto done;

        usleep(DISPLAY_CMD_WAIT_US);

        char response[4096] = { 0 };
        ssize_t total = 0;
        while (total < (ssize_t)sizeof(response) - 1)
        {
            ssize_t n = recv(sock, response + total,
                             sizeof(response) - 1 - (size_t)total, 0);
            if (n <= 0)
                break;
            total += n;
            if (strstr(response, "OK") != NULL)
                break;
        }
    }

    rc = 0;

done:
    if (sock >= 0)
        close(sock);
    freeaddrinfo(res);
    return rc;
}

static int display_current_volume(const char *host)
{
    struct addrinfo hints = {
        .ai_family = AF_UNSPEC,
        .ai_socktype = SOCK_STREAM,
    };
    struct addrinfo *res = NULL;
    char portbuf[16];
    char req[256];
    char response[4096];
    int sock = -1;
    int volume = 30;

    snprintf(portbuf, sizeof(portbuf), "%d", BOSE_REST_PORT);
    if (getaddrinfo(host, portbuf, &hints, &res) != 0 || res == NULL)
        return volume;

    sock = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sock < 0)
        goto done;

    struct timeval tv = { .tv_sec = DISPLAY_IO_TIMEOUT, .tv_usec = 0 };
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    if (connect(sock, res->ai_addr, res->ai_addrlen) != 0)
        goto done;

    snprintf(req, sizeof(req),
        "GET /volume HTTP/1.1\r\n"
        "Host: %s:%s\r\n"
        "Connection: close\r\n"
        "\r\n",
        host, portbuf);
    if (send(sock, req, strlen(req), 0) < 0)
        goto done;

    ssize_t total = 0;
    while (total < (ssize_t)sizeof(response) - 1)
    {
        ssize_t n = recv(sock, response + total,
                         sizeof(response) - 1 - (size_t)total, 0);
        if (n <= 0)
            break;
        total += n;
    }
    response[total] = '\0';

    static const char *volume_tags[] = {
        "<targetvolume>", "<actualvolume>", NULL,
    };

    for (const char **tag = volume_tags; *tag != NULL; tag++)
    {
        const char *start = strstr(response, *tag);
        if (start == NULL)
            continue;
        start += strlen(*tag);
        const char *end = strstr(start, "</");
        if (end == NULL)
            continue;
        char buf[16];
        size_t len = (size_t)(end - start);
        if (len >= sizeof(buf))
            continue;
        memcpy(buf, start, len);
        buf[len] = '\0';
        volume = atoi(buf);
        break;
    }

done:
    if (sock >= 0)
        close(sock);
    freeaddrinfo(res);
    return volume;
}

static const char *DISPLAY_FIELDS[] = {
    "title", "artist", "album", "source", "station", "state", NULL,
};

int upnp_display_clear(const char *host)
{
    char commands[10][64];
    char cmd_refresh[64];
    const char *cmd_ptrs[10];
    size_t ncmds = 0;

    if (host == NULL || host[0] == '\0')
        return -1;

    for (const char **field = DISPLAY_FIELDS; *field != NULL; field++)
    {
        snprintf(commands[ncmds], sizeof(commands[ncmds]),
                 "abl rdset %s \" \"", *field);
        cmd_ptrs[ncmds] = commands[ncmds];
        ncmds++;
    }

    cmd_ptrs[ncmds++] = "abl rdsend ttag";
    cmd_ptrs[ncmds++] = "abl rdsend state";
    snprintf(cmd_refresh, sizeof(cmd_refresh), "sys volume %d updateDisplay",
             display_current_volume(host));
    cmd_ptrs[ncmds++] = cmd_refresh;

    return telnet_send_commands(host, cmd_ptrs, ncmds);
}

int upnp_display_push_title(const char *host, const char *title)
{
    char safe[512];
    char cmd_title[640];
    char cmd_state[640];
    char cmd_refresh[64];
    const char *commands[5];
    size_t ncmds = 0;

    if (host == NULL || host[0] == '\0' || title == NULL || title[0] == '\0')
        return -1;

    escape_display_text(title, safe, sizeof(safe));
    snprintf(cmd_title, sizeof(cmd_title), "abl rdset title \"%s\"", safe);
    snprintf(cmd_state, sizeof(cmd_state), "abl rdset state \"%s\"", safe);
    snprintf(cmd_refresh, sizeof(cmd_refresh), "sys volume %d updateDisplay",
             display_current_volume(host));

    commands[ncmds++] = cmd_title;
    commands[ncmds++] = cmd_state;
    commands[ncmds++] = "abl rdsend ttag";
    commands[ncmds++] = "abl rdsend state";
    commands[ncmds++] = cmd_refresh;
    return telnet_send_commands(host, commands, ncmds);
}