#
# Defines environment variables.
#
# Authors:
#   Sorin Ionescu <sorin.ionescu@gmail.com>
#

# Ensure that a non-login, non-interactive shell has a defined environment.
if [[ ( "$SHLVL" -eq 1 && ! -o LOGIN ) && -s "${ZDOTDIR:-$HOME}/.zprofile" ]]; then
  source "${ZDOTDIR:-$HOME}/.zprofile"
fi

export GOPATH=$HOME/go
export VIRTUALENVWRAPPER_PYTHON=/usr/bin/python3
export FZF_DEFAULT_OPTS='--prompt="▷ " --pointer="➜" --color="bg+:-1,info:green,fg:white,fg+:white,pointer:red,hl:bright-yellow,hl+:blue,prompt:white,header:blue"'

alias vi=nvim
alias vim=nvim
alias vimdiff='nvim -d'
alias docker=podman
