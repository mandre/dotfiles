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
