#!/bin/sh

# Necessite imagemagick, jhead et exif, ainsi que tout le necessaire pour le script encode_video.sh


if [ $# -lt 2 ]; then
	echo 1>&2 "
Usage: $0 repertoire qualite [taille]

qualite : (70 pour quasiment aucune perte, 80-90 pour archives parfaites)
taille : la plus grande dimension de la photo en sortie
    "
	exit 127
fi

IMAGES=0
VIDEOS=0
ERRORS=0

TAILLE_ORIGINE_IMAGES=0
TAILLE_FINALE_IMAGES=0
TAILLE_ORIGINE_VIDEOS=0
TAILLE_FINALE_VIDEOS=0

REP_ORIGINE=$PWD
cd "$1"

QUALITY=$2

if [ $# -ge 3 ]; then
	DIMENSION=$3
else
	DIMENSION=0
fi

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
# Ne gere pas les fichiers MPEG (pas interessants a recompresser) ni les fichiers MOV (transcode supporte pas encore)

liste=`find . -type f -name \*.JPG -o -name \*.jpg -o -name \*.avi -o -name \*.AVI -o -name \*.mov -o -name \*.MOV`
liste=`echo "$liste" | sed  -e s/" "/abcdef/g`

for f in $liste; do

# ... et on restaure le nom de fichier avant de l'utiliser

	f=`echo "$f" | sed -e s/abcdef/" "/g`

	directory=$(dirname "$f")
	name=$f
	size=`ls -k -s "$f" | awk '{print $1}'`

	case "$f" in
		*.jpg|*.JPG) extension=jpg;;
		*.avi|*.AVI) extension=avi;;
		*.mov|*.MOV) extension=mov;;
	esac

	if [ $extension = "jpg" ]; then

# On recupere la date de prise de la photo pour la renommer

		imgdate=`metacam "$f" 2>/dev/null | egrep 'Image Capture Date:' | cut -d: -f2- | grep ":" | sed 's/ //;s/ /-/;s/:/./g'`
		#imgdate=`exif -t 0x9003 "$f" 2>/dev/null | egrep 'Value:' | cut -d: -f2- | grep ":" | sed 's/ //;s/ /-/;s/:/./g'`

		if [ "$imgdate" ]; then
			name="$directory/$imgdate.$extension"
			seq=1
			while [ "`ls -l "$name" 2>/dev/null`" ]; do
				name="$directory/$imgdate-$seq.$extension"
				seq=$(($seq+1))
			done
		fi

# On recompresse, on enleve les infos EXIF, on renomme, voire on redimensionne

		taille=`jhead  "$f" | grep Resolution | cut -d: -f2 | awk '{print $1}'`

		if [ $DIMENSION -ne 0 -a $taille -gt $DIMENSION ]; then
			convert -size ${DIMENSION}x${DIMENSION} -quality $QUALITY -resize ${DIMENSION}x${DIMENSION} "$f" "$name"
		else
			convert -quality $QUALITY "$f" "$name"
		fi

# Si aucun probleme lors de la recompression

		if [ $? -eq 0 ] ; then
			echo "Recompression reussie de \"$f\" en \"$name\"..."
			if [ "$f" != "$name" ]; then
				rm -f "$f"
			fi
			IMAGES=$(($IMAGES+1))
			TAILLE_ORIGINE_IMAGES=$(($TAILLE_ORIGINE_IMAGES+$size))
			size=`ls -k -s "$name" | awk '{print $1}'`
			TAILLE_FINALE_IMAGES=$(($TAILLE_FINALE_IMAGES+$size))
		else
			echo "Probleme en traitant \"$f\" !" 1>&2
			ERRORS=$(($ERRORS+1))
		fi

	else

# Traite les videos avec le script encode_video.sh

		name="."`echo "$f" | cut -d. -f2`".avi"
		"$HOME/bin/pics/scripts/encode_video.sh" "$f" "$name"
		
		if [ $? -eq 0 ] ; then
			VIDEOS=$(($VIDEOS+1))
			TAILLE_ORIGINE_VIDEOS=$(($TAILLE_ORIGINE_VIDEOS+$size))
			size=`ls -k -s "$name" | awk '{print $1}'`
			TAILLE_FINALE_VIDEOS=$(($TAILLE_FINALE_VIDEOS+$size))
#                        rm "$f"
		else
			ERRORS=$(($ERRORS+1))
		fi
	fi

done

echo "$IMAGES images recompressees avec succes, passant de $TAILLE_ORIGINE_IMAGES Ko a $TAILLE_FINALE_IMAGES Ko."
echo "$VIDEOS videos recompressees avec succes, passant de $TAILLE_ORIGINE_VIDEOS Ko a $TAILLE_FINALE_VIDEOS Ko."
echo "$ERRORS erreurs." 1>&2

cd $REP_ORIGINE

exit 0
