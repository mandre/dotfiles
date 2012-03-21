#
# Sets Oh My Zsh options.
#
# Authors:
#   Sorin Ionescu <sorin.ionescu@gmail.com>
#

# Set the key mapping style to 'emacs' or 'vi'.
zstyle ':omz:editor' keymap 'vi'

# Auto convert .... to ../..
zstyle ':omz:editor' dot-expansion 'no'

# Set case-sensitivity for completion, history lookup, etc.
zstyle ':omz:*:*' case-sensitive 'no'

# Color output (auto set to 'no' on dumb terminals).
zstyle ':omz:*:*' color 'yes'

# Auto set the tab and window titles.
zstyle ':omz:terminal' auto-title 'yes'

# Set the plugins to load (see $OMZ/plugins/).
zstyle ':omz:load' plugin 'archive' 'git' 'ruby'

# Set the prompt theme to load.
# Setting it to 'random' loads a random theme.
# Auto set to 'off' on dumb terminals.
zstyle ':omz:prompt' theme 'mandre'

# This will make you shout: OH MY ZSHELL!
source "$HOME/.oh-my-zsh/init.zsh"

# Customize to your needs...

# Additional PATH settings
if [[ -n $GDMSESSION ]]; then
	# Linux
	PATH=$HOME/bin:$PATH        # Personal binaries
else
	# Mac
	PATH=$HOME/bin:$PATH        # Personal binaries
	PATH=/opt/local/sbin:$PATH  # MacPorts
	PATH=/opt/local/bin:$PATH   # MacPorts

	alias gvim='/Applications/MacVim.app/Contents/MacOS/Vim -g'
	alias gvimdiff='/Applications/MacVim.app/Contents/MacOS/Vim -g -d'
fi
export PATH

# Custom commands
pod() { cd ~/dev/pod/modules/pod/$1; }
_pod() { _files -W ~/dev/pod/modules/pod -/; }
compdef _pod pod

# Speed up git completion for huge repositories
__git_files () {
	_wanted files expl 'local files' _files
}
