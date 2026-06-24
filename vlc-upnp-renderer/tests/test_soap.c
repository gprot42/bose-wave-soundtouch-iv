#include "upnp_soap.h"

#include <stdio.h>
#include <string.h>

static int expect_didl_contains(const char *title, const char *url,
                                const char *needle)
{
    char didl[8192];

    if (upnp_build_didl_metadata(title, url, NULL, NULL, "audio/mpeg",
                                 didl, sizeof(didl)) != 0)
    {
        fprintf(stderr, "FAIL: could not build DIDL metadata\n");
        return 1;
    }

    if (strstr(didl, needle) == NULL)
    {
        fprintf(stderr, "FAIL: DIDL missing %s in %s\n", needle, didl);
        return 1;
    }

    return 0;
}

int main(void)
{
    if (expect_didl_contains("My Song", "http://192.168.0.1:9000/track.mp3",
                              "&lt;dc:title&gt;My Song&lt;/dc:title&gt;") != 0)
        return 1;
    if (expect_didl_contains("Amp & Bass",
                              "http://host/song.mp3",
                              "&lt;dc:title&gt;Amp &amp;amp; Bass&lt;/dc:title&gt;") != 0)
        return 1;
    FILE *f = fopen("fixtures/soap_get_transport_info.xml", "r");
    if (f == NULL)
        f = fopen("../fixtures/soap_get_transport_info.xml", "r");
    if (f == NULL)
    {
        fprintf(stderr, "skip: no SOAP fixture\n");
        return 0;
    }

    char buf[4096];
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    fclose(f);
    buf[n] = '\0';

    char state[64];
    if (upnp_soap_parse_tag(buf, "CurrentTransportState", state, sizeof(state)) != 0)
    {
        fprintf(stderr, "FAIL: could not parse CurrentTransportState\n");
        return 1;
    }

    if (strcmp(state, "PLAYING") != 0)
    {
        fprintf(stderr, "FAIL: unexpected state: %s\n", state);
        return 1;
    }

    printf("OK: parsed CurrentTransportState: %s\n", state);
    return 0;
}