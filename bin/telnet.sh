#!/bin/bash

# based on https://major.io/2016/07/22/setting-up-a-telnet-handler-in-gnome-3/

# Remove the telnet:// and, for ipv6, braces
stripped=$(echo $1 | sed -e 's#telnet://##' -e 's/\]//' -e 's/\[//' -e 's|/||')

# extract the last field that is port number
port=$(echo $stripped | awk -F: '{print $NF}')

# extract all fields but the last one that is address
addr=$(echo $stripped | awk -F: '{$NF=""; print $0}' | sed -e 's/[[:space:]]$//' -e 's/ /:/g')

# Telnet to the remote session
/usr/bin/telnet $addr $port
# tmux new-window -d -k -n zuul
# tmux setw       -t zuul monitor-activity off
# tmux send-keys  -t zuul "/usr/bin/telnet $addr $port" C-m

# Don't close out the terminal unless we are done
read -p "Press a key to exit"
