#!/bin/bash

rsync -Pav -e 'ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible' ~/dev/openstack/tripleo-common undercloud:
rsync -Pav -e 'ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible' ~/dev/openstack/tripleo-validations undercloud:
rsync -Pav -e 'ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible' ~/dev/openstack/instack-undercloud undercloud:
rsync -Pav -e 'ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible' ~/dev/openstack/tripleo-heat-templates undercloud:

rsync -Pav -e 'ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible' ~/dev/rdo/DLRN/data/repos/current/*.rpm undercloud:

# Fixed with latest image
# rsync -Pav -e 'ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible' ~/dev/openstack/tripleo-puppet-elements/elements/puppet-modules root@undercloud:/usr/share/tripleo-puppet-elements/

rsync -Pav -e 'ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible' ~/bin/init-undercloud.sh undercloud:

# ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible undercloud "cd tripleo-validations; sudo pip install ."
# ssh -F /home/martin/.quickstart-gouda/ssh.config.ansible undercloud "cd tripleo-common; ./deploy.sh"
