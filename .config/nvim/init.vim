if has('nvim-0.5')
  source ~/.config/nvim/init-0.5.vim
else
  set runtimepath^=~/.config/vim runtimepath+=~/.config/vim/after
  let &packpath = &runtimepath
  source ~/.config/vim/vimrc
endif
