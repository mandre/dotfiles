#!/bin/sh

for a in *.flac
do
	OUTF=`echo "$a" | sed s/"\.flac$"/"\.mp3"/g`

	ARTIST=`metaflac "$a" --show-tag=ARTIST | sed s/.*=//g`
	TITLE=`metaflac "$a" --show-tag=TITLE | sed s/.*=//g`
	ALBUM=`metaflac "$a" --show-tag=ALBUM | sed s/.*=//g`
	GENRE=`metaflac "$a" --show-tag=GENRE | sed s/.*=//g`
	TRACKNUMBER=`metaflac "$a" --show-tag=TRACKNUMBER | sed s/.*=//g`
	DATE=`metaflac "$a" --show-tag=DATE | sed s/.*=//g`

	flac -c -d "$a" | lame -V 0 - "$OUTF"
	id3v2 -t "$TITLE" -T "$TRACKNUMBER" -a "$ARTIST" -A "$ALBUM" -g "$GENRE" -y "$DATE" "$OUTF"
done

mkdir "$ARTIST" && mkdir "$ARTIST"/"$ALBUM"
mv *.mp3 "$ARTIST"/"$ALBUM"/.
