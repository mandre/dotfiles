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
    # sudo pip install -U --no-deps ./tripleo-common/

elif [ $PROJECT == 'containers' ]; then
    sudo yum install -y docker
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo sed -i 's/5000/8787/' /etc/sysconfig/docker-registry
    sudo systemctl enable docker-registry
    sudo systemctl start docker-registry
    sudo pip install docker-py
    sudo chmod 0666 /run/docker.sock

    # Install kolla in case we need to rebuild images
    git clone https://github.com/openstack/kolla.git
    cd kolla
    git checkout stable/mitaka
    virtualenv ~/kolla-venv
    source ~/kolla-venv/bin/activate
    pip install -U pip
    pip install -r requirements.txt
    time ./tools/build.py --base centos --type binary --namespace tripleoupstream --registry localhost:8787 --tag mitaka --push \
	neutron-openvswitch-agent \
	nova-compute \
	nova-libvirt \
	openvswitch-db-server \
	openvswitch-vswitchd
    cd
    deactivate
fi

./undercloud-install.sh
./overcloud-prep-images.sh
./overcloud-prep-flavors.sh
./overcloud-prep-network.sh
./overcloud-custom-tht-script.sh

source ~/stackrc
# Configure nameserver for the overcloud
SUBNET_UUID=$(neutron subnet-list -c id -f value)
neutron subnet-update ${SUBNET_UUID} --dns-nameserver 192.168.23.1

if [ $PROJECT == 'containers' ]; then

    # Upload atomic-host image to glance
    wget http://cloud.centos.org/centos/7/atomic/images/CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    gunzip CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    openstack image create --file CentOS-Atomic-Host-7-GenericCloud.qcow2 --disk-format qcow2 --container-format bare atomic-image

    # Deploy latest artifacts
    ./pull_puppet_modules.sh
    tripleo-common/scripts/upload-puppet-modules --directory ~/puppet-modules/

    # Populate docker registry
    # sudo python /home/stack/tripleo-common/upload_shit.py
    /home/stack/tripleo-common/rebuild-heat-agents.sh

    # Raise heat nested stack limit
    sudo sed -i -r "s,^[# ]*max_nested_stack_depth *=.+$,max_nested_stack_depth = 6," /etc/heat/heat.conf
    sudo systemctl restart openstack-heat-engine
    
    # Setup network isolation
    cat >/home/stack/custom.yaml <<-EOF
parameter_defaults:
  EC2MetadataIp: 192.0.2.1
  ControlPlaneDefaultRoute: 192.0.2.1
EOF
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
    # openstack overcloud deploy --templates /home/stack/tripleo-heat-templates/ -e /home/stack/tripleo-heat-templates/environments/docker.yaml -e /home/stack/tripleo-heat-templates/environments/docker-network.yaml -e /home/stack/tripleo-heat-templates/environments/docker-network-isolation.yaml -e /home/stack/tripleo-heat-templates/environments/network-isolation.yaml -e /home/stack/tripleo-heat-templates/environments/net-single-nic-with-vlans.yaml -e /home/stack/custom.yaml --libvirt-type qemu
fi
