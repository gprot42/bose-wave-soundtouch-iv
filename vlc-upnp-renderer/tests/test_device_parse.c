#include "upnp_device.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *bose_location =
    "http://192.168.0.119:8091/XD/BO5EBO5E-F00D-F00D-FEED-7C010A90E9CA.xml";

static const char *expected_bose_name = "Bose SoundTouch 90E9CA";

static char *fixture_sibling_path(const char *primary, const char *sibling)
{
    const char *slash = strrchr(primary, '/');
    if (slash == NULL)
        return strdup(sibling);

    size_t prefix = (size_t)(slash - primary) + 1;
    char *path = NULL;
    if (asprintf(&path, "%.*s%s", (int)prefix, primary, sibling) < 0)
        return NULL;
    return path;
}

static int parse_fixture(const char *path, const char *expected_name)
{
    FILE *f = fopen(path, "r");
    if (f == NULL)
    {
        fprintf(stderr, "FAIL: cannot open %s\n", path);
        return 1;
    }

    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);

    char *xml = malloc((size_t)sz + 1);
    if (xml == NULL)
        return 1;
    fread(xml, 1, (size_t)sz, f);
    fclose(f);
    xml[sz] = '\0';

    upnp_device_t dev;
    if (upnp_device_parse_xml(xml, (size_t)sz, bose_location, &dev) != 0)
    {
        fprintf(stderr, "FAIL: parse error for %s\n", path);
        free(xml);
        return 1;
    }

    if (dev.friendly_name == NULL ||
        strcmp(dev.friendly_name, expected_name) != 0)
    {
        fprintf(stderr, "FAIL: %s friendly_name: %s (expected %s)\n",
                path,
                dev.friendly_name ? dev.friendly_name : "(null)",
                expected_name);
        upnp_device_clear(&dev);
        free(xml);
        return 1;
    }

    if (dev.av_control == NULL || strstr(dev.av_control, "AVTransport") == NULL)
    {
        fprintf(stderr, "FAIL: %s av_control: %s\n", path,
                dev.av_control ? dev.av_control : "(null)");
        upnp_device_clear(&dev);
        free(xml);
        return 1;
    }

    printf("OK: %s -> %s\n", path, dev.friendly_name);
    upnp_device_clear(&dev);
    free(xml);
    return 0;
}

int main(int argc, char **argv)
{
    const char *path = (argc > 1) ? argv[1] : "fixtures/bose_device_description.xml";
    if (parse_fixture(path, expected_bose_name) != 0)
        return 1;

    char *hello_world = fixture_sibling_path(path, "bose_device_hello_world.xml");
    if (hello_world == NULL)
        return 1;
    if (parse_fixture(hello_world, expected_bose_name) != 0)
    {
        free(hello_world);
        return 1;
    }
    free(hello_world);

    return 0;
}