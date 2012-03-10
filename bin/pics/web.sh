#!/bin/bash
# requires: imagemagic, jhead, exif

if [ $# -lt 1 ]; then
        echo Usage: $0 repertoire
	exit 127
fi

TARGET=~/Pictures/`basename $1`
TARGET_TMP="$TARGET"_tmp

cp -r $1 $TARGET_TMP
		    
~/bin/pics/scripts/tourne_photos.sh $TARGET_TMP;
#~/bin/pics/scripts/init_rotation.sh $TARGET_TMP;
~/bin/pics/scripts/traite_tout.sh $TARGET_TMP 85 640;

mv $TARGET_TMP $TARGET
