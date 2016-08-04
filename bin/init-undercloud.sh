#!/bin/bash

set -e

PROJECT=$1
if [ -z $PROJECT ]; then
    PROJECT='validations'
fi

sudo yum install -y epel-release
sudo pip install -U pip

if [ $PROJECT == 'validations' ]; then
    sed -i '3i\
enable_validations = true\
' undercloud.conf
    sed -i '3i\
enable_ui = true\
' undercloud.conf
    sudo pip install ./instack-undercloud/
    sudo pip install ./tripleo-validations/
    sudo pip install ./tripleo-common/

    # The patch merges in tripleo-common
    # TODO(mandre) needs to be added to RPM
    sudo cp /usr/share/tripleo-common/sudoers /etc/sudoers.d/tripleo-common 2>/dev/null || true

    # Until tripleo-common rpm is updated
    sudo curl https://raw.githubusercontent.com/openstack/mistral/87aeb0ac5afb9765ed81fe48264f14f35ea9dedc/mistral/engine/rpc.py -o /usr/lib/python2.7/site-packages/mistral/engine/rpc.py

elif [ $PROJECT == 'containers' ]; then
    sudo pip install ./tripleo-heat-templates/
    sudo yum install -y docker
    sudo systemctl start docker
    sudo pip install docker-py
fi


./undercloud-install.sh
./undercloud-post-install.sh

if [ $PROJECT == 'containers' ]; then
    source ~/stackrc
    wget http://cloud.centos.org/centos/7/atomic/images/CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    gunzip CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    glance image-create --name atomic-image --file CentOS-Atomic-Host-7-GenericCloud.qcow2 --disk-format qcow2 --container-format bare
    # wget https://download.fedoraproject.org/pub/alt/atomic/stable/CloudImages/x86_64/images/Fedora-Atomic-24-20160712.0.x86_64.qcow2
    # glance image-create --name atomic-image --file Fedora-Atomic-24-20160712.0.x86_64.qcow2 --disk-format qcow2 --container-format bare
fi

if [ $PROJECT == 'validations' ]; then
    # ./overcloud-deploy.sh
    # ./overcloud-deploy-post.sh
    echo
elif [ $PROJECT == 'containers' ]; then
    echo "skipping overcloud install"
    # source stackrc
    # openstack overcloud deploy --templates /home/stack/tripleo-heat-templates/ -e /home/stack/tripleo-heat-templates/environments/docker.yaml -e /home/stack/tripleo-heat-templates/environments/docker-network.yaml
fi
