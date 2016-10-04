#!/bin/bash

set -e

PROJECT=$1
if [ -z $PROJECT ]; then
    # PROJECT='validations'
    PROJECT='containers'
fi

sudo pip install -U pip

if [ $PROJECT == 'validations' ]; then
    sed -i '3i\
enable_validations = true\
' undercloud.conf
    sed -i '3i\
enable_ui = true\
' undercloud.conf
    # sudo pip install -U --no-deps ./instack-undercloud/
    # sudo pip install -U --no-deps ./tripleo-validations/
    sudo pip install -U --no-deps ./tripleo-common/

    # Until tripleo-common rpm is updated
    #sudo curl https://raw.githubusercontent.com/openstack/mistral/87aeb0ac5afb9765ed81fe48264f14f35ea9dedc/mistral/engine/rpc.py -o /usr/lib/python2.7/site-packages/mistral/engine/rpc.py

elif [ $PROJECT == 'containers' ]; then
    sudo yum install -y docker
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo systemctl enable docker-registry
    sudo systemctl start docker-registry
    sudo pip install docker-py

    # Install kolla in case we need to rebuild images
    # git clone https://github.com/openstack/kolla.git
    # cd kolla
    # git checkout stable/mitaka
    # virtualenv ~/kolla-venv
    # source ~/kolla-venv/bin/activate
    # pip install -U pip
    # pip install -r requirements.txt
fi

./undercloud-install.sh
./overcloud-prep-images.sh
./overcloud-prep-flavors.sh
./overcloud-prep-network.sh
./overcloud-custom-tht-script.sh

source ~/stackrc
# Configure nameserver for the overcloud
SUBNET_UUID=$(neutron subnet-list -c id -f value)
neutron subnet-update ${SUBNET_UUID} --dns-nameserver 192.168.122.1

if [ $PROJECT == 'containers' ]; then

    # Upload atomic-host image to glance
    wget http://cloud.centos.org/centos/7/atomic/images/CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    gunzip CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    openstack image create --file CentOS-Atomic-Host-7-GenericCloud.qcow2 --disk-format qcow2 --container-format bare atomic-image

    # Deploy latest artifacts
    # ./pull_puppet_modules.sh
    # tripleo-common/scripts/upload-puppet-modules --directory ~/puppet-modules/

    # Populate docker registry
    sudo python /home/stack/tripleo-common/upload_shit.py
    sudo /home/stack/tripleo-common/rebuild-heat-agents.sh
fi

if [ $PROJECT == 'validations' ]; then
    # ./overcloud-deploy.sh
    # ./overcloud-deploy-post.sh
    echo
elif [ $PROJECT == 'containers' ]; then
    echo "skipping overcloud install"
    # source stackrc
    # openstack stack delete --yes --wait overcloud
    # mistral environment delete overcloud
    # openstack overcloud deploy --templates /home/stack/tripleo-heat-templates/ -e /home/stack/tripleo-heat-templates/environments/docker.yaml -e /home/stack/tripleo-heat-templates/environments/docker-network.yaml --libvirt-type qemu
fi
