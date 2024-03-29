#
# Executes commands at login pre-zshrc.
#
# Authors:
#   Sorin Ionescu <sorin.ionescu@gmail.com>
#

#
# Browser
#

if [[ -z "$BROWSER" && "$OSTYPE" == darwin* ]]; then
  export BROWSER='open'
fi

#
# Editors
#

export EDITOR='nvim'
export VISUAL='nvim'
if [[ -z "$PAGER" ]]; then
  export PAGER='less'
fi

#
# Language
#

if [[ -z "$LANG" ]]; then
  export LANG='en_US.UTF-8'
fi

#
# Paths
#

# Ensure path arrays do not contain duplicates.
typeset -gU cdpath fpath mailpath path

# Set the list of directories that cd searches.
# cdpath=(
#   $cdpath
# )

# Set the list of directories that Zsh searches for programs.
path=(
  $HOME/{,s}bin(N)
  /opt/{homebrew,local}/{,s}bin(N)
  /usr/local/{,s}bin(N)
  $path
)

#
# Less
#

# Set the default Less options.
# Mouse-wheel scrolling has been disabled by -X (disable screen clearing).
# Remove -X and -F (exit if the content fits on one screen) to enable it.
if [[ -z "$LESS" ]]; then
  export LESS='-F -g -i -M -R -X -z-4'
fi

# Set the Less input preprocessor.
# Try both `lesspipe` and `lesspipe.sh` as either might exist on a system.
if [[ -z "$LESSOPEN" ]] && (( $#commands[(i)lesspipe(|.sh)] )); then
  export LESSOPEN="| /usr/bin/env $commands[(i)lesspipe(|.sh)] %s 2>&-"
fi

#
# MacOSX specific
#

if [[ "$OSTYPE" == darwin* ]]; then
  # Alias
  alias gvim='/Applications/MacVim.app/Contents/MacOS/Vim -g'
  alias gvimdiff='/Applications/MacVim.app/Contents/MacOS/Vim -g -d'
  alias tmux='tmux -2 -f ~/.tmux-osx.conf'

  # For MacVim
  path+=(
    /opt/local/{bin,sbin}    # MacPorts
  )
  export LD_LIBRARY_PATH=/opt/local/lib

  eval "$(rbenv init -)"
fi
