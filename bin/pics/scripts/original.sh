#!/bin/bash

# little script to generate image galleries for use with original.
# uses imagemagick's convert
# (c) 2005 boris de laage <bdelaage@free.fr>
# based on imgconv by Jakub Steiner
#
# The 'help' section sucks, as my english does.


#default options
dir=./web-gallery
zip=0
mq=0
hq=0
interactive=0
verbose=echo

#info.txt stuff
gal_auth=""
gal_name=""
gal_desc=""
gal_date=""
gal_user=""
gal_pass=""

# convert options
convertor=`which convert`
extra_ops="-strip"

# This script
name=`basename $0`

# getopt stuff
shortopts="a:hHin:d:D:Mqo:Z"
longopts="author:quiet,help,interactive,name:,date:,description:,\
mq,hq,output:,archive"



function echo_help () {
cat <<EOF
Usage : $1 [OPTIONS]... [FILE]...
Convert FILEs

  -o, --output DIR           make gallery in DIR
  -M, --mq                   include 1024x768 images (MQ)
  -H, --hq                   include original images (HQ)
  -Z, --archive              make archives
  -i, --interactive          edit gallery informations interactively
  -a, --author NAME          set author's name
  -n, --name NAME            set gallery's name
  -d, --date DATE            set date to DATE
  -D, --description DESC     description
  -q, --quiet                don't say anything
  -h, --help                 display this help and exit

FILEs must be JPEG  or PNG. if DIR is not given, the
gallery will be created in $dir.

EOF

}

good_file() {
    local ftype

    ftype=`file -b "$1" | cut -d " " -f 1`

    if [ "$ftype" == "JPEG" ] || [ "$ftype" == "PNG" ]
    then
	return 0
    else
	return 1
    fi

}


# If we don't have ImageMagick, cry & exit
if [ -z $convertor ]; then
    echo "convert not found... Please install ImageMagick."
    exit 1
fi


# Parse options
TEMP=`getopt -o $shortopts --long $longopts -n $name -- "$@"`
[ $? != 0 ] && exit 1

eval set -- "$TEMP"
while true; do
    case "$1" in
	-h|--help)
	    echo_help $name ; exit 0 ;;

	-i|--interactive)
	    interactive=1 ; shift ;;

	-n|--name)
	    gal_name=$2 ; shift 2 ;;

	-d|--date)
	    gal_date=$2 ; shift 2 ;;

	-D|--description)
	    gal_desc=$2 ; shift 2 ;;

	-a|--author)
	    gal_auth=$2 ; shift 2 ;;

	-o|--output)
	    dir=$2 ; shift 2 ;;

	-Z|--zip)
	    zip=1 ; shift ;;

	-q|--quiet)
	    verbose=false ; shift ;;

	-M|--mq)
	    mq=1 ;  shift ;;

	-H|--hq)
	    hq=1 ; shift ;;

	--)
	    shift ; break ;;

	*)
	    echo "OOops.. getopt error !" ; echo $@ ; exit 1 ;;
    esac
done


# If no input files are given, display usage & exit
if [ $# == 0 ]; then
    cat <<EOF
Usage: $name [-hMHZ] [-o directory] file...
       $name -o Gallery *.jpg
Try \`$name --help' for more information.
EOF
    exit 1
fi

# make dirs
mkdir -p $dir/thumbs
mkdir -p $dir/lq
mkdir -p $dir/comments
chmod o+w $dir/comments
[ $mq -gt 0 ] && mkdir -p $dir/mq
[ $hq -gt 0 ] && mkdir -p $dir/hq
[ $zip -gt 0 ] && mkdir -p $dir/zip

# Protect info.txt, even if we don't make it.
echo "<Files info.txt>" > $dir/.htaccess
echo "        deny from all" >> $dir/.htaccess
echo "</Files>" >> $dir/.htaccess


$verbose "Generating O.R.I.G.I.N.A.L gallery in $dir"

files=$(echo $@ | sed 's/ /\n/g' | sort)

#files=$@

i=1
for imagefile in $files; do

    good_file "$imagefile"
    if [ $? != 0 ]; then
	$verbose "$imagefile is not a JPEG or PNG file, skipped"
	continue
    fi

  $verbose -n "converting $imagefile "

  $verbose -n "."
  $convertor -geometry 120x120 -modulate 100,100,100 -unsharp 1x20 \
      -quality 60 $extra_opts "$imagefile" $dir/thumbs/img-$i.jpg

  $verbose -n "."
  $convertor -geometry 640x480 -modulate 100,100,100 -unsharp 1x5 \
      -quality 90 "$imagefile" $dir/lq/img-$i.jpg

  if [ $mq -gt 0 ]; then
      $verbose -n "."
      $convertor -geometry 1024x768 -modulate 100,100,100 -unsharp 1x5 \
	  -quality 80 "$imagefile" $dir/mq/img-$i.jpg
  fi

  if [ $hq -gt 0 ] ; then
      $verbose -n "."
      cp "$imagefile" $dir/hq/img-$i.jpg
  fi

  # template for comment
  echo "<span>Photo $i</span>" > $dir/comments/$i.txt


  i=`expr $i + 1`
  $verbose " done"
done

# zip stuff
if [ $zip -gt 0 ]; then
    $verbose "archiving"
    [ $mq ] && zip -R $dir/zip/mq.zip  web-gallery/mq/*.jpg
    [ $hq ] && zip -R $dir/zip/hq.zip web-gallery/hq/*.jpg
fi

#info.txt
protect=n
if [ $interactive == 1 ]; then
    echo -n "Gallery name [$gal_name]: "
    read gal_name
    echo -n "Description: "
    read gal_desc
    echo -n "Author [$gal_auth]: "
    read gal_auth
    echo -n "Date [$gal_date]: "
    read gal_date
    echo -n "Resctrict access ? [y/N]: "
    read protect
    if [ "$protect" == "y" ] || [ "$protect" == "Y" ]; then
	echo -n "restricted user [$gal_user]: "
	read gal_user
	echo -n "restricted password [$gal_pass]: "
	read gal_pass
    fi
fi

[ "$gal_name" != "" ] && echo "name|$gal_name" >> $dir/info.txt
[ "$gal_auth" != "" ] && echo "author|$gal_auth" >> $dir/info.txt
[ "$gal_date" != "" ] && echo "date|$gal_date" >> $dir/info.txt
[ "$gal_desc" != "" ] && echo "description|$gal_desc" >> $dir/info.txt
[ "$gal_user" != "" ] && echo "restricted_user|$gal_user" >> $dir/info.txt
[ "$gal_pass" != "" ] && echo "restricted_password|$gal_pass" >> $dir/info.txt
