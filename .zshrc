#
# Executes commands at the start of an interactive session.
#
# Authors:
#   Sorin Ionescu <sorin.ionescu@gmail.com>
#

# Source Prezto.
if [[ -s "${ZDOTDIR:-$HOME}/.zprezto/init.zsh" ]]; then
  source "${ZDOTDIR:-$HOME}/.zprezto/init.zsh"
fi

# Customize to your needs...

# Custom commands
# openstack() { cd ~/dev/openstack/$1; }
# _openstack() { _files -W ~/dev/openstack -/; }
# compdef _openstack openstack

kolla() { cd ~/dev/openstack/kolla; }

# Speed up git completion for huge repositories
__git_files () {
	_wanted files expl 'local files' _files
}

bindkey '^R' history-incremental-search-backward
bindkey '^S' history-incremental-search-forward
bindkey '^P' history-search-backward
bindkey '^N' history-search-forward

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
