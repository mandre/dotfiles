#!/usr/bin/env python
# Python script to make Skype co-operate with GNOME3 notifications.
# 
#
# Copyright (c) 2011, John Stowers
#
# Adapted from skype-notify.py
# Copyright (c) 2009, Lightbreeze
#
# 
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#
# to use this script: Open Skype -> Open the menu and press 'Options' or press Ctrl-O
# -> hit the 'Advanced' button and check 'Execute the following script on _any_ event'
# -> paste: python /path/to/skype-notify.py -e"%type" -n"%sname" -f"%fname" -p"%fpath" -m"%smessage" -s%fsize -u%sskype
# -> disable or enable the notifications you want to receive.

import sys
from optparse import OptionParser
from gi.repository import Notify, GLib, Gtk

# name :    summary, body, icon (optional, default skype),
#           transient (optional, default True),
#           urgency (optional, default NORMAL)

NOTIFICATIONS = {
    'SkypeLogin':           ("Skype","You have logged into Skype with {contact}","skype"),
    'SkypeLogout':          ("You have logged out of Skype",None,"user-offline"),
    'SkypeLoginFailed':     ("Skype login failed",None,"user-offline"),
    'CallConnecting':       ("Dailing... {contact}",None,"call-start"),
    'CallRingingIn':        ("Brring..","{contact} is calling you","call-start", False, Notify.Urgency.CRITICAL),
    'CallRingingOut':       ("Dididi.. dididi...","You are calling {contact}","call-start"),
    'CallAnswered':         ("Call Answered",None,"call-start"),
    'VoicemailReceived':    ("{contact}","Voicemail Received","skype"),
    'VoicemailSent':        ("Voicemail Sent",None,"skype"),
    'ContactOnline':        ("{contact} is now online",None,"user-online"),
    'ContactOffline':       ("{contact} is now offline",None,"user-offline"),
    'ContactDeleted':       False,
    'ChatIncomingInitial':  ("{contact}","{message}","im-message-new"),
    'ChatIncoming':         ("{contact}","{message}","im-message-new"),
    'ChatOutgoing':         False,
    'ChatJoined':           ("{contact} joined chat","{message}","emblem-people"),
    'ChatParted':           ("{contact} left chat","{message}",None),
    'TransferComplete':     ("Transfer Complete","{filename} saved to {path}{filename}","gtk-save"),
    'TransferFailed':       ("Transfer Failed","{filename}","gtk-close"),
    'Birthday':             ("{contact} has a birthday Tomorrow",None,"appointment-soon"),
    '%type':                False, #we get %type at skype startup sometimes. ignore it
}

class NotifyForSkype:
    def __init__(self):
        # Initiate pynotify
        if not Notify.init("Skype Notifier"):
            sys.exit(-1)

        # Add argument parser options
        parser = OptionParser()
        parser.add_option("-e", "--event", dest="type", help="type of SKYPE_EVENT")
        parser.add_option("-n", "--sname", dest="sname", help="display-name of contact")
        parser.add_option("-u", "--skype", dest="sskype", help="skype-username of contact")
        parser.add_option("-m", "--smessage", dest="smessage", help="message body")
        parser.add_option("-p", "--path", dest="fpath", help="path to file")
        parser.add_option("-s", "--size", dest="fsize", help="incoming file size")
        parser.add_option("-f", "--filename", dest="fname", help="file name", metavar="FILE")
        (o, args) = parser.parse_args()

        try:
            verb = "Showing"
            self._show_notification(o, *NOTIFICATIONS[o.type])
        except KeyError:
            verb = "Unknown"
            self._show_notification(o, "{type}", "{contact} ({user})")
        except ValueError:
            verb = "Skipped"

        print "%s notification: %s\n\targs: %s" % (verb, o.type, ", ".join(sys.argv))

    def _show_notification(self, o, summary, body, icon="skype", transient=True, urgency=Notify.Urgency.NORMAL):
        if summary == None:
            summary = ""
        if body == None:
            body = ""

        #im-message-new is not a standard icon name, neither is user-*, but they are present
        #in many themes that support empathy. lookup the supplied icon and fallback to skype
        #if missing
        if not Gtk.IconTheme.get_default().has_icon(icon):
            icon = "skype"

        n = Notify.Notification.new(
                summary.format(filename=o.fname,path=o.fpath,contact=o.sname,message=o.smessage,type=o.type,user=o.sskype),
                body.format(filename=o.fname,path=o.fpath,contact=o.sname,message=o.smessage,type=o.type,user=o.sskype),
                icon)
        n.set_hint("transient", GLib.Variant.new_boolean(transient))
        n.set_urgency(urgency)
        n.show()

cm = NotifyForSkype()