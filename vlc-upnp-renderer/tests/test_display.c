#include "upnp_display.h"

#include <stdio.h>
#include <string.h>

static int expect_title(const char *source, const char *want)
{
    char got[256];

    upnp_display_title_from_source(source, got, sizeof(got));
    if (strcmp(got, want) != 0)
    {
        fprintf(stderr, "FAIL: title_from_source(%s) = %s, want %s\n",
                source, got, want);
        return 1;
    }
    return 0;
}

int main(void)
{
    if (expect_title("/music/My Song.mp3", "My Song") != 0)
        return 1;
    if (expect_title("file:///Users/me/track.flac", "track") != 0)
        return 1;
    if (expect_title("http://host/stream.mp3", "stream") != 0)
        return 1;
    if (expect_title("Radio%20Stream", "Radio Stream") != 0)
        return 1;

    printf("OK: display title parsing\n");
    return 0;
}