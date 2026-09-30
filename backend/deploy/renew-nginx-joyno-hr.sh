#!/bin/sh

# Certbot runs deploy hooks for every renewed certificate on this VPS.
case " ${RENEWED_DOMAINS:-} " in
  *" srv1981649.hstgr.cloud "*)
    nginx -t && systemctl reload nginx
    ;;
esac
