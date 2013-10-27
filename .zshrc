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
pod() { cd ~/dev/pod/modules/pod/$1; }
_pod() { _files -W ~/dev/pod/modules/pod -/; }
compdef _pod pod

# Speed up git completion for huge repositories
__git_files () {
	_wanted files expl 'local files' _files
}

bindkey '^R' history-incremental-search-backward
bindkey '^S' history-incremental-search-forward
bindkey '^P' history-search-backward
bindkey '^N' history-search-forward
