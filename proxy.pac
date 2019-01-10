function FindProxyForURL(url, host)
{
    if (host=="lwn.net" || shExpMatch(host, "*.lwn.net")){
        return "PROXY squid.redhat.com:3128; DIRECT" ;
    } else {
        return "DIRECT";
    }
}
