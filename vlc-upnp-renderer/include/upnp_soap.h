/*
 * upnp_soap.h — UPnP SOAP client
 */
#ifndef UPNP_SOAP_H
#define UPNP_SOAP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

int upnp_soap_call(const char *control_url, const char *service_type,
                   const char *action, const char *args_xml,
                   char *response, size_t resplen);

/* Build escaped DIDL-Lite for SetAVTransportURI CurrentURIMetaData. */
int upnp_build_didl_metadata(const char *title, const char *media_url,
                             const char *artist, const char *album,
                             const char *mime, int64_t duration_ticks,
                             char *out, size_t outlen);

int upnp_av_set_uri(const char *av_control, const char *media_url,
                    const char *title, const char *artist, const char *album,
                    int64_t duration_ticks);
int upnp_av_play(const char *av_control);
int upnp_av_stop(const char *av_control);
int upnp_av_pause(const char *av_control);
int upnp_av_seek_rel(const char *av_control, const char *target_hms);
int upnp_av_get_transport_state(const char *av_control, char *state, size_t statelen);
int upnp_av_get_position_info(const char *av_control, char *rel_time, size_t rel_len,
                              char *track_dur, size_t dur_len);

int upnp_rc_set_volume(const char *rc_control, int volume);
int upnp_rc_set_mute(const char *rc_control, bool mute);

/* Parse a simple <tag>value</tag> element from a SOAP response body. */
int upnp_soap_parse_tag(const char *xml, const char *tag, char *out, size_t outlen);

#endif /* UPNP_SOAP_H */