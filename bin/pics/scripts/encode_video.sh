#!/bin/sh

if [ $# -lt 2 ]; then
	echo 1>&2 "
Usage: $0 source destination

    "
	exit 127
fi

SOURCE="$1"
DEST=$2

# Check the source video

WIDTH=`mplayer -vo null -ao null -frames 0 -identify "$SOURCE" 2>/dev/null | grep "ID_VIDEO_WIDTH" | sed "s/ID_VIDEO_WIDTH=//g"`
HEIGHT=`mplayer -vo null -ao null -frames 0 -identify "$SOURCE" 2>/dev/null | grep "ID_VIDEO_HEIGHT" | sed "s/ID_VIDEO_HEIGHT=//g"`
VIDEO_FPS=`mplayer -vo null -ao null -frames 0 -identify "$SOURCE" 2>/dev/null | grep "ID_VIDEO_FPS" | sed "s/ID_VIDEO_FPS=//g"`

if [ -z $WIDTH ]; then
	echo "Could not detect video size!"
	exit 1
fi

VIDEO_BITRATE=$(($WIDTH * $HEIGHT / 200))

echo "

Video detected: $WIDTH x $HEIGHT, framerate=$VIDEO_FPS
Will use $VIDEO_BITRATE kbps

"


mplayer -vc dummy -vo null -ao pcm:file=temp2.pcm "$SOURCE" 2>/dev/null
# You can remove --downmix to keep 2 different channels
#lame --decode temp2.pcm temp.pcm
#oggenc temp.pcm
lame -h -V 3 temp2.pcm temp.mp3

transcode -i "$SOURCE" -x mplayer -y xvid4,null -J hqdn3d -R 1 -w "$VIDEO_BITRATE" -o /dev/null
transcode -i "$SOURCE" -x mplayer -y xvid4,null -J hqdn3d -R 2 -w "$VIDEO_BITRATE" -C 3 -o temp.avi

rm -f $DEST
#ogmmerge -o "$DEST" temp.avi temp.ogg
avimerge -o "$DEST" -i temp.avi -p temp.mp3

rm divx4.log 2>/dev/null
rm temp.avi 2>/dev/null
#rm temp.ogg 2>/dev/null
#rm temp.pcm 2>/dev/null
rm temp2.pcm 2>/dev/null
rm temp.mp3 2>/dev/null

exit 0
