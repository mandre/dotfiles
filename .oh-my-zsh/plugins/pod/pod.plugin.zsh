pod() { cd ~/dev/pod/modules/pod/$1; }
_pod() { _files -W ~/dev/pod/modules/pod -/; }
compdef _pod pod
