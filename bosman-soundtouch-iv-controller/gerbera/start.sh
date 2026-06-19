#!/bin/zsh

podman run -d \
  --name gerbera \
  -p 49494:49494 \
  -p 1900:1900/udp \
  -e GERBERA_VIRTUAL_URL=http://localhost:49494/ \
  -e GERBERA_EXTERNAL_URL=http://localhost:49494/ \
  -v /Users/andre/work/bosman/gerbera/config.xml:/var/run/gerbera/config.xml \
  -v /Users/andre/work/bosman/gerbera:/mnt/content:ro \
  gerbera/gerbera:3.0.0