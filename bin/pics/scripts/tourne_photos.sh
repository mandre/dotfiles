#!/bin/sh

# Tourne toutes les images qui doivent etre tournees d'apres les infos EXIF, et
# met les bits de rotation a 0

# Necessite jhead


if [ $# -lt 1 ]; then
	echo 1>&2 "
Usage: $0 repertoire
    "
	exit 127
fi

NUM=0
TOURNEES=0

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

	res=`jhead -autorot "$f"`
	
	if [ "$res" ]; then
		echo "\"$f\" tournee avec succes."
		TOURNEES=$(($TOURNEES + 1))
	else
		echo "\"$f\" n'a pas besoin d'etre tournee."
	fi
	NUM=$(($NUM + 1))
done

echo "$TOURNEES images sur $NUM tournees avec succes."

cd $REP_ORIGINE

exit 0
