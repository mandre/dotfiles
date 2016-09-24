#!/bin/bash

MODULES="
aodh
ceilometer
ceph
cinder
glance
gnocchi
heat
horizon
ironic
keystone
manila
midonet
mistral
neutron
nova
openstack_extras
openstacklib
oslo
pacemaker
sahara
swift
tempest
tripleo
trove
vswitch
zaqar
"

MODULE_DIR=$HOME/puppet-modules

mkdir $MODULE_DIR
pushd $MODULE_DIR

for module in $MODULES; do
	if [ -d $module ]; then
		pushd $module
		git pull
		popd
	else
		git clone https://git.openstack.org/openstack/puppet-$module $module
	fi
done

popd
