/*
 * upnp_display.h — Wave SoundTouch IV front-display text via :17000 telnet CLI
 */
#ifndef UPNP_DISPLAY_H
#define UPNP_DISPLAY_H

#include <stddef.h>

#define UPNP_DISPLAY_INTERVAL_US (3 * 1000000LL)

/* Derive a display title from a path or URL (extension stripped). */
void upnp_display_title_from_source(const char *source, char *out, size_t outlen);

/* Push title to the remote-display buffer (abl rdset / abl rdsend). */
int upnp_display_push_title(const char *host, const char *title);

#endif /* UPNP_DISPLAY_H */