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

zstyle :prompt:pure:git:stash show yes

# Customize to your needs...

# Custom commands
openshift() { cd ~/go/src/github.com/openshift/$1; }
_openshift() { _files -W ~/go/src/github.com/openshift -/; }
compdef _openshift openshift

kolla() { cd ~/dev/openstack/kolla; }

_hackon() { _files -W ${XDG_DATA_HOME:-${HOME}/.local/share}/hackon -/; }
compdef _hackon hackon

# Speed up git completion for huge repositories
__git_files () {
	_wanted files expl 'local files' _files
}

bindkey '^R' history-incremental-search-backward
bindkey '^S' history-incremental-search-forward
bindkey '^P' history-search-backward
bindkey '^N' history-search-forward

ZSH_CACHE_DIR="${XDG_CACHE_HOME:-${HOME}/.cache}/zsh_completion"
if [[ ! -d "$ZSH_CACHE_DIR" ]]; then
	mkdir -p "$ZSH_CACHE_DIR"
fi

if (( $+commands[oc] )); then
    __OC_COMPLETION_FILE="${ZSH_CACHE_DIR}/oc_completion"

    if [[ ! -f $__OC_COMPLETION_FILE ]]; then
        oc completion zsh | sed 's#${requestComp} 2>/dev/null#${requestComp} 2>/dev/null | head -n -1 | fzf --no-multi -1 -0 --cycle #g' >! $__OC_COMPLETION_FILE
    fi

    [[ -f $__OC_COMPLETION_FILE ]] && source $__OC_COMPLETION_FILE

    unset __OC_COMPLETION_FILE

    compdef kubectl=oc
fi

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
