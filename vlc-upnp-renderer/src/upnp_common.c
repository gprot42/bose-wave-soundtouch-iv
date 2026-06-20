/*
 * upnp_common.c — shared helpers and device registry
 */
#include "upnp_common.h"

#include <arpa/inet.h>
#include <ctype.h>
#include <netdb.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef CLOCK_FREQ
# define CLOCK_FREQ 1000000LL
#endif

typedef struct registry_entry
{
    char *key;
    upnp_device_t dev;
    struct registry_entry *next;
} registry_entry_t;

static registry_entry_t *g_registry;
static pthread_mutex_t g_registry_lock = PTHREAD_MUTEX_INITIALIZER;

void upnp_device_clear(upnp_device_t *dev)
{
    if (dev == NULL)
        return;
    free(dev->location);
    free(dev->friendly_name);
    free(dev->av_control);
    free(dev->rc_control);
    free(dev->host);
    memset(dev, 0, sizeof(*dev));
}

int upnp_device_copy(upnp_device_t *dst, const upnp_device_t *src)
{
    upnp_device_clear(dst);
    if (src->location && !(dst->location = strdup(src->location)))
        return -1;
    if (src->friendly_name && !(dst->friendly_name = strdup(src->friendly_name)))
        goto error;
    if (src->av_control && !(dst->av_control = strdup(src->av_control)))
        goto error;
    if (src->rc_control && !(dst->rc_control = strdup(src->rc_control)))
        goto error;
    if (src->host && !(dst->host = strdup(src->host)))
        goto error;
    dst->port = src->port;
    return 0;

error:
    upnp_device_clear(dst);
    return -1;
}

static char *make_registry_key(const char *host, uint16_t port)
{
    char *key = NULL;
    if (asprintf(&key, "%s:%u", host, port) < 0)
        return NULL;
    return key;
}

int upnp_registry_add(const upnp_device_t *dev)
{
    if (dev == NULL || dev->host == NULL)
        return -1;

    char *key = make_registry_key(dev->host, dev->port);
    if (key == NULL)
        return -1;

    pthread_mutex_lock(&g_registry_lock);

    for (registry_entry_t *e = g_registry; e != NULL; e = e->next)
    {
        if (strcmp(e->key, key) == 0)
        {
            upnp_device_clear(&e->dev);
            if (upnp_device_copy(&e->dev, dev) != 0)
            {
                pthread_mutex_unlock(&g_registry_lock);
                free(key);
                return -1;
            }
            pthread_mutex_unlock(&g_registry_lock);
            free(key);
            return 0;
        }
    }

    registry_entry_t *entry = calloc(1, sizeof(*entry));
    if (entry == NULL)
    {
        pthread_mutex_unlock(&g_registry_lock);
        free(key);
        return -1;
    }

    entry->key = key;
    if (upnp_device_copy(&entry->dev, dev) != 0)
    {
        free(entry->key);
        free(entry);
        pthread_mutex_unlock(&g_registry_lock);
        return -1;
    }

    entry->next = g_registry;
    g_registry = entry;
    pthread_mutex_unlock(&g_registry_lock);
    return 0;
}

int upnp_registry_remove(const char *host, uint16_t port)
{
    char *key = make_registry_key(host, port);
    if (key == NULL)
        return -1;

    pthread_mutex_lock(&g_registry_lock);

    registry_entry_t **pp = &g_registry;
    while (*pp != NULL)
    {
        if (strcmp((*pp)->key, key) == 0)
        {
            registry_entry_t *rm = *pp;
            *pp = rm->next;
            upnp_device_clear(&rm->dev);
            free(rm->key);
            free(rm);
            pthread_mutex_unlock(&g_registry_lock);
            free(key);
            return 0;
        }
        pp = &(*pp)->next;
    }

    pthread_mutex_unlock(&g_registry_lock);
    free(key);
    return -1;
}

int upnp_registry_lookup(const char *host, uint16_t port, upnp_device_t *out)
{
    char *key = make_registry_key(host, port);
    if (key == NULL)
        return -1;

    pthread_mutex_lock(&g_registry_lock);

    for (registry_entry_t *e = g_registry; e != NULL; e = e->next)
    {
        if (strcmp(e->key, key) == 0)
        {
            int ret = upnp_device_copy(out, &e->dev);
            pthread_mutex_unlock(&g_registry_lock);
            free(key);
            return ret;
        }
    }

    pthread_mutex_unlock(&g_registry_lock);
    free(key);
    return -1;
}

void upnp_registry_clear(void)
{
    pthread_mutex_lock(&g_registry_lock);
    while (g_registry != NULL)
    {
        registry_entry_t *e = g_registry;
        g_registry = e->next;
        upnp_device_clear(&e->dev);
        free(e->key);
        free(e);
    }
    pthread_mutex_unlock(&g_registry_lock);
}

int upnp_local_ip_toward(const char *dest_host, char *buf, size_t buflen)
{
    int fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0)
        return -1;

    struct sockaddr_in dst = { .sin_family = AF_INET };
    if (inet_pton(AF_INET, dest_host, &dst.sin_addr) != 1)
    {
        struct addrinfo hints = { .ai_family = AF_INET, .ai_socktype = SOCK_DGRAM };
        struct addrinfo *res = NULL;
        if (getaddrinfo(dest_host, NULL, &hints, &res) != 0 || res == NULL)
        {
            close(fd);
            return -1;
        }
        struct sockaddr_in *sa = (struct sockaddr_in *)res->ai_addr;
        dst.sin_addr = sa->sin_addr;
        freeaddrinfo(res);
    }
    dst.sin_port = htons(1);

    if (connect(fd, (struct sockaddr *)&dst, sizeof(dst)) != 0)
    {
        close(fd);
        return -1;
    }

    struct sockaddr_in local;
    socklen_t len = sizeof(local);
    if (getsockname(fd, (struct sockaddr *)&local, &len) != 0)
    {
        close(fd);
        return -1;
    }

    const char *ip = inet_ntoa(local.sin_addr);
    if (ip == NULL)
    {
        close(fd);
        return -1;
    }

    strncpy(buf, ip, buflen - 1);
    buf[buflen - 1] = '\0';
    close(fd);
    return 0;
}

int upnp_parse_hms_duration(const char *hms, int64_t *ticks_out)
{
    if (hms == NULL || ticks_out == NULL || hms[0] == '\0')
        return -1;

    int hour = 0, min = 0, sec = 0;
    int n = sscanf(hms, "%d:%d:%d", &hour, &min, &sec);
    if (n == 2)
    {
        sec = min;
        min = hour;
        hour = 0;
    }
    else if (n != 3)
        return -1;

    *ticks_out = ((int64_t)hour * 3600 + min * 60 + sec) * CLOCK_FREQ;
    return 0;
}

static const int mp3_bitrates[16] = {
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0
};

static const int mp3_samplerates[4][4] = {
    { 11025, 12000, 8000, 0 },
    { 0, 0, 0, 0 },
    { 22050, 24000, 16000, 0 },
    { 44100, 48000, 32000, 0 },
};

static int mp3_frame_samples(int version, int layer)
{
    if (layer == 3)
        return version == 3 ? 1152 : 576;
    if (layer == 2)
        return 1152;
    return 384;
}

static int mp3_parse_frame(const unsigned char *buf, size_t len,
                           int *version, int *layer, int *bitrate_kbps,
                           int *samplerate, int *padding, int *samples)
{
    if (len < 4 || buf[0] != 0xFF || (buf[1] & 0xE0) != 0xE0)
        return -1;

    int ver = (buf[1] >> 3) & 0x03;
    int lay = (buf[1] >> 1) & 0x03;
    int br_idx = (buf[2] >> 4) & 0x0F;
    int sr_idx = (buf[2] >> 2) & 0x03;
    int pad = (buf[2] >> 1) & 0x01;

    if (ver == 1 || lay == 0 || br_idx == 0 || br_idx == 15 || sr_idx == 3)
        return -1;

    int ver_code = ver == 3 ? 3 : ver == 2 ? 2 : 0;
    int lay_code = 4 - lay;
    int bitrate = mp3_bitrates[br_idx];
    int samplerate_hz = mp3_samplerates[ver_code][sr_idx];

    if (bitrate <= 0 || samplerate_hz <= 0)
        return -1;

    *version = ver_code;
    *layer = lay_code;
    *bitrate_kbps = bitrate;
    *samplerate = samplerate_hz;
    *padding = pad;
    *samples = mp3_frame_samples(ver_code, lay_code);
    return 0;
}

static size_t mp3_frame_length(int version, int layer, int bitrate_kbps,
                               int samplerate, int padding)
{
    if (layer == 3)
    {
        if (version == 3)
            return (size_t)((144000 * bitrate_kbps) / samplerate + padding);
        return (size_t)((72000 * bitrate_kbps) / samplerate + padding);
    }
    if (layer == 2)
        return (size_t)((144000 * bitrate_kbps) / samplerate + padding);
    return (size_t)((12000 * bitrate_kbps) / samplerate + padding);
}

static int64_t mp3_duration_from_xing(const unsigned char *frame, size_t frame_len,
                                      int version, int layer, int bitrate_kbps,
                                      int samplerate, int samples_per_frame)
{
    size_t hdr_len = (version == 3 && layer == 3) ? 4 : 6;
    if (frame_len < hdr_len + 12)
        return 0;

    const unsigned char *xing = NULL;
    for (size_t off = hdr_len; off + 4 <= frame_len && off < hdr_len + 120; off++)
    {
        if (memcmp(frame + off, "Xing", 4) == 0
         || memcmp(frame + off, "Info", 4) == 0)
        {
            xing = frame + off;
            break;
        }
    }

    if (xing == NULL)
        return 0;

    unsigned flags = (unsigned)((xing[4] << 24) | (xing[5] << 16)
                              | (xing[6] << 8) | xing[7]);
    size_t pos = 8;
    if ((flags & 0x01) && pos + 4 <= frame_len)
    {
        unsigned frames = (unsigned)((xing[pos] << 24) | (xing[pos + 1] << 16)
                                   | (xing[pos + 2] << 8) | xing[pos + 3]);
        return ((int64_t)frames * samples_per_frame * CLOCK_FREQ) / samplerate;
    }

    (void)bitrate_kbps;
    return 0;
}

static int64_t mp3_duration_ticks(const char *path)
{
    FILE *fp = fopen(path, "rb");
    if (fp == NULL)
        return 0;

    unsigned char hdr[10];
    long audio_start = 0;
    if (fread(hdr, 1, 10, fp) == 10 && memcmp(hdr, "ID3", 3) == 0)
    {
        size_t tagsize = ((hdr[6] & 0x7F) << 21) | ((hdr[7] & 0x7F) << 14)
                       | ((hdr[8] & 0x7F) << 7) | (hdr[9] & 0x7F);
        audio_start = (long)(10 + tagsize);
    }
    fseek(fp, audio_start, SEEK_SET);

    struct stat st;
    if (fstat(fileno(fp), &st) != 0 || st.st_size <= audio_start)
    {
        fclose(fp);
        return 0;
    }

    size_t scan_len = (size_t)st.st_size - (size_t)audio_start;
    if (scan_len > 262144)
        scan_len = 262144;

    unsigned char *buf = malloc(scan_len);
    if (buf == NULL)
    {
        fclose(fp);
        return 0;
    }

    size_t got = fread(buf, 1, scan_len, fp);
    fclose(fp);
    if (got < 4)
    {
        free(buf);
        return 0;
    }

    int64_t duration = 0;
    for (size_t i = 0; i + 4 < got; i++)
    {
        int version, layer, bitrate, samplerate, padding, samples;
        if (mp3_parse_frame(buf + i, got - i, &version, &layer, &bitrate,
                            &samplerate, &padding, &samples) != 0)
            continue;

        size_t frame_len = mp3_frame_length(version, layer, bitrate,
                                            samplerate, padding);
        if (frame_len < 4 || i + frame_len > got)
            continue;

        duration = mp3_duration_from_xing(buf + i, frame_len, version, layer,
                                          bitrate, samplerate, samples);
        if (duration > 0)
            break;

        size_t audio_bytes = (size_t)st.st_size - (size_t)audio_start;
        duration = ((int64_t)audio_bytes * 8 * CLOCK_FREQ)
                 / ((int64_t)bitrate * 1000);
        break;
    }

    free(buf);
    return duration;
}

int64_t upnp_probe_media_duration(const char *path)
{
    if (path == NULL || path[0] == '\0')
        return 0;

    const char *dot = strrchr(path, '.');
    if (dot != NULL && strcasecmp(dot, ".mp3") == 0)
        return mp3_duration_ticks(path);

    return 0;
}

int upnp_url_decode(const char *in, char *out, size_t outlen)
{
    if (in == NULL || out == NULL || outlen == 0)
        return -1;

    size_t j = 0;
    for (size_t i = 0; in[i] != '\0'; i++)
    {
        unsigned char c = (unsigned char)in[i];
        if (c == '%' && isxdigit((unsigned char)in[i + 1])
                   && isxdigit((unsigned char)in[i + 2]))
        {
            char hex[3] = { in[i + 1], in[i + 2], '\0' };
            c = (unsigned char)strtoul(hex, NULL, 16);
            i += 2;
        }

        if (j + 1 >= outlen)
            return -1;
        out[j++] = (char)c;
    }

    out[j] = '\0';
    return 0;
}

char *upnp_url_encode_path(const char *path)
{
    size_t inlen = strlen(path);
    char *out = malloc(inlen * 3 + 1);
    if (out == NULL)
        return NULL;

    static const char *safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~/";
    char *p = out;

    for (size_t i = 0; i < inlen; i++)
    {
        unsigned char c = (unsigned char)path[i];
        if (strchr(safe, c) != NULL)
            *p++ = c;
        else
            p += sprintf(p, "%%%02X", c);
    }
    *p = '\0';
    return out;
}