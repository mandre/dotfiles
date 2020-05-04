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

PROMPT='${OS_CLOUD:+"%F{242}$OS_CLOUD %f"}'$PROMPT
RPROMPT+='${VIM:+" %B%F{green}V%f%b"}${MC_SID:+" %B%F{blue}☪%f%b"}'
SPROMPT='zsh: correct %F{red}%R%f to %F{green}%r%f [nyae]? '

# Customize to your needs...

# Custom commands
openshift() { cd ~/go/src/github.com/openshift/$1; }
_openshift() { _files -W ~/go/src/github.com/openshift -/; }
compdef _openshift openshift

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
