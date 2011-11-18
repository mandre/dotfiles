set nocompatible               " be iMproved

"  ---------------------------------------------------------------------------
"  Plugins
"  ---------------------------------------------------------------------------

filetype on
filetype off
set runtimepath+=~/.vim/bundle/vundle/

call vundle#rc()

Bundle 'gmarik/vundle'

" Programming
Bundle 'matchit.zip'
Bundle 'taglist.vim'
" Bundle 'a.vim'
" Bundle 'cscope_macros.vim'
Bundle 'AutoTag'
Bundle 'tComment'
Bundle 'scrooloose/syntastic.git'

" Snippets
Bundle 'MarcWeber/vim-addon-mw-utils.git'
Bundle 'tomtom/tlib_vim.git'
Bundle 'garbas/vim-snipmate.git'
Bundle 'honza/snipmate-snippets.git'

" Git
Bundle 'fugitive.vim'

" Ruby
Bundle 'vim-ruby/vim-ruby.git'
Bundle 'rails.vim'
Bundle 'ecomba/vim-ruby-refactoring.git'
" Bundle 'astashov/vim-ruby-debugger.git'
" http://blog.10to1.be/ruby/2011/02/13/vim-flog-plugin/
" Bundle 'fousa/vim-flog.git'
" :silent exe 'g:flog_enable'
" http://vimcasts.org/blog/2010/12/a-text-object-for-ruby-blocks/
" 'var' then 'ar' or 'ir'
Bundle 'kana/vim-textobj-user.git'
Bundle 'nelstrom/vim-textobj-rubyblock.git'

" Utility
Bundle 'LargeFile'
Bundle 'repeat.vim'
Bundle 'surround.vim'
Bundle 'file-line'
Bundle 'Align'
Bundle 'bufexplorer.zip'
Bundle 'netrw.vim'
Bundle 'ervandew/supertab'
Bundle 'ZoomWin'
Bundle 'ack.vim'
Bundle 'sessionman.vim'
Bundle 'sjl/gundo.vim.git'
Bundle 'YankRing.vim'

" FuzzyFinder
" Bundle 'L9'
" Bundle 'FuzzyFinder'

" Command-T
" Bundle 'git://git.wincent.com/command-t.git'

" (HT|X)ml tool
" Bundle 'ragtag.vim'

filetype plugin indent on

"  ---------------------------------------------------------------------------
"  General
"  ---------------------------------------------------------------------------

let mapleader = ","
let g:mapleader = ","
" set modelines=0
set history=50		" keep 50 lines of command line history
set nobackup
set nowritebackup
" set noswapfile
set undofile
set autoread
set sessionoptions="blank,buffers,curdir,folds,help,tabpages,winsize"

" Match and search
set ignorecase		" Do case insensitive matching
set smartcase
set gdefault
set incsearch		" do incremental searching
set showmatch		" Show matching brackets.

" Switch syntax highlighting on, when the terminal has colors
" Also switch on highlighting the last used search pattern.
if &t_Co > 2 || has("gui_running")
  syntax on
  set hlsearch
endif

"  ---------------------------------------------------------------------------
"  UI
"  ---------------------------------------------------------------------------

set title
set scrolloff=3
set ruler
set showmode
set showcmd
set novisualbell
set backspace=indent,eol,start
" set laststatus=2

if has("gui_running")
  set cursorline
  " Highlight cursorline ONLY in the active window
  au WinEnter * setlocal cursorline
  au WinLeave * setlocal nocursorline
endif

"hi def link myTodo Todo
"match myTodo "\<TBD\>"
" syn match Todo "TBD" containedIn=ALL

if has("cscope")
    " use both cscope and ctag for 'ctrl-]', ':ta', and 'vim -t'
    set cscopetag

    " check cscope for definition of a symbol before checking ctags: set to 1
    " if you want the reverse search order.
    set csto=1
endif

"  ---------------------------------------------------------------------------
"  Text Formatting
"  ---------------------------------------------------------------------------

" Only do this part when compiled with support for autocommands.
if has("autocmd")
  " Enable file type detection.
  " Use the default filetype settings, so that mail gets 'tw' set to 72,
  " 'cindent' is on in C files, etc.
  " Also load indent files, to automatically do language-dependent indenting.
  filetype plugin indent on

  " Put these in an autocmd group, so that we can delete them easily.
  augroup vimrcEx
  au!

  " For all text files set 'textwidth' to 78 characters.
  autocmd FileType text setlocal textwidth=78

  " For all Ruby and eRuby, set indent to 2 spaces
  autocmd FileType ruby setlocal ts=2 sw=2 expandtab
  autocmd FileType eruby setlocal ts=2 sw=2 expandtab
  au BufRead,BufNewFile {Gemfile,Capfile,Kirkfile,Rakefile,Thorfile,config.ru} set ft=ruby

  " When editing a file, always jump to the last known cursor position.
  " Don't do it when the position is invalid or when inside an event handler
  " (happens when dropping a file on gvim).
  autocmd BufReadPost *
    \ if line("'\"") > 0 && line("'\"") <= line("$") |
    \   exe "normal g`\"" |
    \ endif

  " Delete trailing spaces from ruby files
  autocmd BufWritePre *.rb :%s/\s\+$//e

  augroup END
else
  set autoindent		" always set autoindenting on
endif " has("autocmd")

set formatoptions+=n

"  ---------------------------------------------------------------------------
"  Status Line
"  ---------------------------------------------------------------------------

"set statusline=%<%f\ %h%m%r%=%-14.(%l,%c%V%)\ %P
set statusline=%#warningmsg#%{SyntasticStatuslineFlag()}%*%{fugitive#statusline()}\ %<%f\ %h%m%r%=%-14.(%l,%c%V%)\ %P
" set statusline=%{ruby_debugger#statusline()}

"  ---------------------------------------------------------------------------
"  Mappings
"  ---------------------------------------------------------------------------

" Center screen when scrolling search results
nmap n nzz
nmap N Nzz

" Turn off arrow keys (this might not be a good idea for beginners, but it is
" the best way to ween yourself of arrow keys on to hjkl)
" http://yehudakatz.com/2010/07/29/everyone-who-tried-to-convince-me-to-use-vim-was-wrong/
" nnoremap <Left> :echoe "Use h"<CR>
" nnoremap <Right> :echoe "Use l"<CR>
" nnoremap <Up> :echoe "Use k"<CR>
" nnoremap <Down> :echoe "Use j"<CR>"
" inoremap <up> <nop>
" inoremap <down> <nop>
" inoremap <left> <nop>
" inoremap <right> <nop>

" Move between splits
nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l

" Map ESC
imap jj <ESC>

" Use :w!! to save file when current user doesn't have permission
cmap w!! %!sudo tee > /dev/null %

" Ctrl + space in insert mode activate autocompletion
" imap <c-space> <c-x><c-o>

" Shift + Enter adds an end
imap <S-CR> <CR><CR>end<Esc>-cc

nnoremap <space> :noh<CR>

" Don't use Ex mode, use Q for formatting
map Q gq

"  ---------------------------------------------------------------------------
"  Function Keys
"  ---------------------------------------------------------------------------

" <F2> File explorer
map <F2> :Ex<CR>
" <F3> Buffer explorer
map <F3> <Leader>be
" <F4> Tag list
map <F4> :TlistToggle<CR>
" <F5> Reload file
map <F5> :e!<CR>
" <F6> Toggle wrap/nowrap
map <F6> :set wrap!<CR>
" <F7> Toggle GUndo tree
map <F7> :GundoToggle<CR>
" <F8> Comment
map <F8> :TComment<CR>j
" <F9> Remove all trailing spaces
map <F9> :let _s=@/<Bar>:%s/\s\+$//e<Bar>:let @/=_s<Bar>:nohl<CR>
" <F10> YankRing
nnoremap <silent> <F10> :YRShow<cr>
inoremap <silent> <F10> <ESC>:YRShow<cr>
" <F12> Compile using makefile
map <F12> :make<CR>

"  ---------------------------------------------------------------------------
"  Plugins
"  ---------------------------------------------------------------------------

" let g:syntastic_enable_signs=1
let g:syntastic_auto_loc_list=1
" let g:ruby_debugger_progname = 'mvim'
" let g:CommandTMatchWindowAtTop=1 " show window at top

" SuperTab
let g:SuperTabDefaultCompletionType = "context"
let g:SuperTabCrMapping = 0

" Bufexplorer
let g:bufExplorerSortBy='fullpath'   " Sort by full file path name.

"  ---------------------------------------------------------------------------
"  GUI
"  ---------------------------------------------------------------------------

if has("gui_running")
  " For Win32 GUI: remove 't' flag from 'guioptions': no tearoff menu entries
  " let &guioptions = substitute(&guioptions, "t", "", "g")
  set guioptions-=T " no toolbar
  " set guioptions-=m " no menus
  set guioptions-=r " no scrollbar on the right
  set guioptions-=R " no scrollbar on the right
  set guioptions-=L " no scrollbar on the left
  set guioptions-=b " no scrollbar on the bottom
  set mousemodel=popup_setpos
  set noballooneval
  colorscheme two2tango
  if has('gui_macvim')
    set guifont=Menlo:h12
    set transparency=10
    set fuoptions=maxvert,maxhorz
  endif
endif

"  ---------------------------------------------------------------------------
"  Misc
"  ---------------------------------------------------------------------------

set backupdir=~/tmp,/tmp
set undodir=~/.vim/.tmp,~/tmp,~/.tmp,/tmp
let g:yankring_history_dir="~/.vim/.tmp"

"Change to current buffer directory
"au BufEnter * execute ":lcd " . expand("%:p:h")

" latex specific stuff
let g:Tex_CompileRule_dvi = 'latex --interaction=nonstopmode $*'

set completeopt=menuone,preview
" Make Vim completion popup menu work just like in an IDE
" set completeopt=longest,menuone
" inoremap <expr> <cr> pumvisible() ? "\<c-y>" : "\<c-g>u\<cr>" 
" inoremap <expr> <c-n> pumvisible() ? "\<lt>c-n>" : "\<lt>c-n>\<lt>c-r>=pumvisible() ? \"\\<lt>down>\" : \"\"\<lt>cr>"
" inoremap <expr> <m-;> pumvisible() ? "\<lt>c-n>" : "\<lt>c-x>\<lt>c-o>\<lt>c-n>\<lt>c-p>\<lt>c-r>=pumvisible() ? \"\\<lt>down>\" : \"\"\<lt>cr>

" Source a global configuration file if available
if filereadable("/etc/vim/vimrc.local")
  source /etc/vim/vimrc.local
endif

" When vimrc, either directly or via symlink, is edited, automatically reload it
autocmd! bufwritepost .vimrc source %
autocmd! bufwritepost vimrc source %
