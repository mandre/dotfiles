#!/bin/sh

# Change la date des photos contenue dans les infos EXIF, pratique par exemple
# quand son appareil est pas a l'heure ou qu'on change de fuseau horaire
# Mettre par exemple -7:00 ou +3:30

# Necessite jhead


if [ $# -lt 1 ]; then
	echo 1>&2 "
Usage: $0 repertoire decalage
    "
	exit 127
fi

NUM=0

REP_ORIGINE=$PWD
cd "$1"


#if tty -s ; then
#	echo Aucune sauvegarde de faite ...
#	echo -n "Continuer quand meme ? "; read ans
#	case "$ans" in
#		o*|O*|y*|Y*)
#			echo "Ca roule!" ;;
#		*)
#			echo "Tant pis...";
#			exit 0	;;
#	esac
#fi

# Remplace les eventuels espaces par "abcdef" pour eviter les problemes avec le for...

liste=`find . -type f -name \*.JPG -o -name \*.jpg`
liste=`echo "$liste" | sed  -e s/" "/abcdef/g`

for f in $liste; do

# ... et on restaure le nom de fichier avant de l'utiliser

	f=`echo "$f" | sed -e s/abcdef/" "/g`

	echo `jhead -norot "$f"`
	
	NUM=$(($NUM+1))

done

echo "$NUM images traitees avec succes."

cd $REP_ORIGINE

exit 0
