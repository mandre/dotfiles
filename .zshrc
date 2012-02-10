# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
ZSH_THEME="mandre"

# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"

# Set to this to use case-sensitive completion
# CASE_SENSITIVE="true"

# Comment this out to disable weekly auto-update checks
# DISABLE_AUTO_UPDATE="true"

# Uncomment following line if you want to disable colors in ls
# DISABLE_LS_COLORS="true"

# Uncomment following line if you want to disable autosetting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment following line if you want red dots to be displayed while waiting for completion
COMPLETION_WAITING_DOTS="true"

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
if [[ -n $GDMSESSION ]]; then
	# Linux
	plugins=(git vi-mode redis-cli rvm bundler pod debian)
else
	# Mac
	plugins=(git vi-mode redis-cli rvm bundler pod macports)
fi

source $ZSH/oh-my-zsh.sh

# Path additions
# List items in the reverse order you want them to appear in $PATH (i.e. last
# items appear first ).
if [[ -n $GDMSESSION ]]; then
	# Linux
	PATH=/usr/local/bin:$PATH   # User binaries
	PATH=/sbin:$PATH            # System binaries
	PATH=/usr/sbin:$PATH        # System binaries
	PATH=/bin:$PATH             # System binaries
	PATH=/usr/bin:$PATH         # System binaries
	PATH=$HOME/bin:$PATH        # Personal binaries
else
	# Mac
	PATH=/usr/X11/bin:$PATH     # X11 Stuff
	PATH=/usr/local/bin:$PATH   # User binaries
	PATH=/sbin:$PATH            # System binaries
	PATH=/usr/sbin:$PATH        # System binaries
	PATH=/bin:$PATH             # System binaries
	PATH=/usr/bin:$PATH         # System binaries
	PATH=$HOME/bin:$PATH        # Personal binaries
	PATH=/opt/local/sbin:$PATH  # MacPorts
	PATH=/opt/local/bin:$PATH   # MacPorts

	alias gvim='/Applications/MacVim.app/Contents/MacOS/Vim -g'
	alias gvimdiff='/Applications/MacVim.app/Contents/MacOS/Vim -g -d'
fi
 
export PATH

# load RVM
[[ -s "$HOME/.rvm/scripts/rvm" ]] && . "$HOME/.rvm/scripts/rvm"

# Speed up git completion for huge repositories
__git_files () { 
	_wanted files expl 'local files' _files 
}
