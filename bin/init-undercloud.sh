#!/bin/bash

set -e

: ${OPT_REBUILD_IMAGES:=0}

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --rebuild-images    rebuild Kolla and heat-agents images"
    echo "  -h, --help          print this help and exit"
}

while [ "x$1" != "x" ]; do

    case "$1" in
        --rebuild-images)
            OPT_REBUILD_IMAGES=1
            ;;

        --help|-h)
            usage
            exit
            ;;

        --) shift
            break
            ;;

        -*) echo "ERROR: unknown option: $1" >&2
            usage >&2
            exit 2
            ;;

        *)  break
            ;;
    esac

    shift
done

install_undercloud() {
    if [ ! -f ~/stackrc ]; then
	./undercloud-install.sh
	./overcloud-prep-images.sh
	./overcloud-prep-flavors.sh
	./overcloud-prep-network.sh
	./overcloud-custom-tht-script.sh
    fi
}

raise_heat_nested_stack_limit() {
    # Raise heat nested stack limit
    sudo sed -i -r "s,^[# ]*max_nested_stack_depth *=.+$,max_nested_stack_depth = 6," /etc/heat/heat.conf
    sudo systemctl restart openstack-heat-engine
}

allow_non_root_docker() {
    if ! getent group docker >/dev/null; then
	sudo groupadd docker
	sudo gpasswd -a ${USER} docker
	newgrp docker
	sudo systemctl restart docker
    fi
}

build_kolla_images() {
    # Install kolla in case we need to rebuild images
    git clone https://github.com/openstack/kolla.git
    cd kolla
    git checkout stable/newton
    virtualenv ~/kolla-venv
    source ~/kolla-venv/bin/activate
    pip install -U pip
    pip install -r requirements.txt
    time ./tools/build.py --base centos --type binary --namespace tripleoupstream --registry localhost:8787 --tag newton --push \
	neutron-openvswitch-agent \
	glance-api \
	nova-compute \
	nova-libvirt \
	openvswitch-db-server \
	openvswitch-vswitchd
    cd
    deactivate
}

populate_docker_registry() {
    if [ "$OPT_REBUILD_IMAGES" = 1 ]; then
	build_kolla_images
	/home/stack/tripleo-common/rebuild-heat-agents.sh
    else
	python -c "from tripleo_common.image.image_uploader import ImageUploadManager; ImageUploadManager(['/home/stack/tripleo-common/contrib/overcloud_containers.yaml']).upload()"
    fi
}

pull_atomic_host() {
    # Upload atomic-host image to glance
    wget http://cloud.centos.org/centos/7/atomic/images/CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    gunzip CentOS-Atomic-Host-7-GenericCloud.qcow2.gz
    openstack image create --file CentOS-Atomic-Host-7-GenericCloud.qcow2 --disk-format qcow2 --container-format bare atomic-image
}

# Configure nameserver for the overcloud
configure_overcloud_dns() {
    SUBNET_UUID=$(neutron subnet-list -c id -f value)
    neutron subnet-update ${SUBNET_UUID} --dns-nameserver 192.168.23.1
}

deploy_latest_puppet_modules() {
    # Deploy latest artifacts
    ./pull_puppet_modules.sh
    tripleo-common/scripts/upload-puppet-modules --directory ~/puppet-modules/
}

# FIXME(mandre) should pick the IP address of the undercloud instead
# it has changed to 192.168.24.1 in recent undercloud
setup_network_isolation() {
    cat >/home/stack/custom.yaml <<-EOF
parameter_defaults:
  EC2MetadataIp: 192.0.2.1
  ControlPlaneDefaultRoute: 192.0.2.1
EOF
}

deploy_overcloud_normal() {
    ./overcloud-deploy.sh
    ./overcloud-deploy-post.sh
}

deploy_overcloud_containers() {
    source stackrc
    openstack stack delete --yes --wait overcloud
    mistral environment delete overcloud
    openstack overcloud deploy --templates /home/stack/tripleo-heat-templates/ -e /home/stack/tripleo-heat-templates/environments/docker.yaml -e /home/stack/tripleo-heat-templates/environments/docker-network.yaml -e /home/stack/tripleo-heat-templates/environments/docker-network-isolation.yaml -e /home/stack/tripleo-heat-templates/environments/network-isolation.yaml -e /home/stack/tripleo-heat-templates/environments/net-single-nic-with-vlans.yaml -e /home/stack/custom.yaml --libvirt-type qemu
}


install_undercloud
raise_heat_nested_stack_limit
allow_non_root_docker
populate_docker_registry

source ~/stackrc
pull_atomic_host
configure_overcloud_dns
deploy_latest_puppet_modules
#deploy_overcloud_containers
