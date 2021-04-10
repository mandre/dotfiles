if has('nvim-0.5')
  source ~/.config/nvim/init-0.5.vim
else
  set runtimepath^=~/.vim runtimepath+=~/.vim/after
  let &packpath = &runtimepath
  source ~/.vimrc
endif
