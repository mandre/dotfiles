#!/bin/bash

HOST=$1

if [ -z $HOST ]; then
	HOST=gouda
fi

# Copy needed git checkouts
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/dev/openstack/instack-undercloud undercloud:
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/dev/openstack/python-tripleoclient undercloud:
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/dev/openstack/tripleo-common undercloud:
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/dev/openstack/tripleo-heat-templates undercloud:
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/dev/openstack/tripleo-validations undercloud:

# Copy locally built RPMs
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/dev/rdo/DLRN/data/repos/current/*.rpm undercloud:

# Copy local scripts
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/bin/init-undercloud.sh undercloud:
rsync -Pav -e "ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible" ~/bin/pull_puppet_modules.sh undercloud:

# ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible undercloud "cd tripleo-validations; sudo pip install ."
# ssh -F /home/martin/.quickstart-${HOST}/ssh.config.ansible undercloud "cd tripleo-common; ./deploy.sh"
