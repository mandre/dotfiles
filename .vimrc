" Preamble {{{
" ---------------------------------------------------------------------------

set nocompatible               " be iMproved

if empty(glob('~/.vim/autoload/plug.vim'))
  silent !mkdir -p ~/.vim/autoload
  silent !curl -fLo ~/.vim/autoload/plug.vim
        \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
  autocmd VimEnter * PlugInstall
endif

" }}}
" Plugins {{{
" ---------------------------------------------------------------------------

call plug#begin('~/.vim/plugged')

" Programming
Plug 'vim-scripts/matchit.zip'
if v:version >= 703
  Plug 'majutsushi/tagbar',       { 'on': 'TagbarToggle' }
endif
Plug 'tpope/vim-commentary',    { 'on': ['<Plug>Commentary', '<Plug>CommentaryLine'] }
Plug 'w0rp/ale'

" Snippets
Plug 'SirVer/ultisnips' ",        { 'on': [] }
Plug 'honza/vim-snippets' ",      { 'on': [] }

" Git
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-rhubarb'
" Plug 'airblade/vim-gitgutter'

" Ruby
Plug 'tpope/vim-rails',         { 'for': 'ruby' }

" Additional language files
Plug 'sheerun/vim-polyglot'

" Utility
" Plug 'vim-scripts/YankRing.vim'
Plug 'wellle/targets.vim'
Plug 'vim-scripts/LargeFile'
Plug 'vim-scripts/file-line'
Plug 'ConradIrwin/vim-bracketed-paste'
Plug 'ervandew/supertab' ",       { 'on': [] }
Plug 'tpope/vim-endwise'
Plug 'tpope/vim-repeat'
Plug 'tpope/vim-sleuth' ",        { 'on': [] }
Plug 'tpope/vim-surround'
Plug 'tpope/vim-unimpaired'
Plug 'tpope/vim-eunuch'
Plug 'tpope/vim-obsession'
Plug 'godlygeek/tabular',       { 'on': 'Tabularize' }
Plug 'eiginn/netrw',
Plug 'tpope/vim-vinegar' ",       { 'on': 'Explore' }
Plug 'vim-scripts/ZoomWin'
Plug 'mileszs/ack.vim'
Plug 'sjl/gundo.vim',           { 'on': 'GundoToggle' }
" Plug 'mbbill/undotree',             { 'on': 'UndotreeToggle'   }
Plug 'whiteinge/diffconflicts'
if has('macunix') && !has("gui_running")
Plug 'sjl/vitality.vim'
endif
Plug 'google/vim-searchindex'
Plug 'xolox/vim-misc',          { 'on': 'Note' }
Plug 'xolox/vim-notes',         { 'on': 'Note' }
Plug 'thcipriani/mediummode',   { 'on': 'MediumModeToggle' }
Plug 'junegunn/fzf', { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'junegunn/fzf.vim'
Plug 'Lokaltog/vim-easymotion', { 'on': ['<Plug>(easymotion-s2)', '<Plug>(easymotion-j)', '<Plug>(easymotion-k)'] }
Plug 'rhysd/clever-f.vim'
Plug 'christoomey/vim-tmux-navigator'
Plug 'terryma/vim-expand-region', { 'on': ['<Plug>(expand_region_expand)', '<Plug>(expand_region_shrink)'] }
Plug 'AndrewRadev/splitjoin.vim'
Plug 'bling/vim-airline'

call plug#end()

" }}}
" General {{{
" ---------------------------------------------------------------------------

let mapleader = ","
let g:mapleader = ","
set encoding=utf-8
set history=50		" keep 50 lines of command line history
set hidden
set confirm
set nobackup
set nowritebackup
set noswapfile
set undofile
set autoread
set sessionoptions="blank,buffers,curdir,folds,help,tabpages,winsize"
set nomodeline          " disable mode lines (security measure)
set smarttab
set shiftround

set number
set relativenumber
set cursorline

" Match and search
set ignorecase		" Do case insensitive matching
set smartcase
set gdefault
set incsearch		" do incremental searching
set showmatch		" Show matching brackets.
" Use sane regexes.
" nnoremap / /\v
" vnoremap / /\v
if has("nvim")
    set inccommand=nosplit
endif

" Spell
if has("spell")
  " set spelllang=fr
  set spelllang=en_us
  nnoremap <leader>ss :set spell!<CR>
endif

" Switch syntax highlighting on, when the terminal has colors
" Also switch on highlighting the last used search pattern.
if &t_Co > 2 || has("gui_running")
  syntax on
  set hlsearch
endif

if has("nvim")
  " Make escape work in the Neovim terminal
  tnoremap <Esc> <C-\><C-n>

  " Make navigation into and out of Neovim terminal splits nicer
  tnoremap <C-h> <C-\><C-N><C-w>h
  tnoremap <C-j> <C-\><C-N><C-w>j
  tnoremap <C-k> <C-\><C-N><C-w>k
  tnoremap <C-l> <C-\><C-N><C-w>l

  " Relative numbers when in normal mode
  autocmd TermOpen * setlocal conceallevel=0 colorcolumn=0 relativenumber

  " Start terminal in insert mode
  autocmd BufEnter term://* startinsert
endif

" Wildmenu completion {{{
set wildmenu
set wildmode=list:longest,list:full

set wildignore+=.hg,.git,.svn                    " Version control
set wildignore+=*.aux,*.out,*.toc                " LaTeX intermediate files
set wildignore+=*.jpg,*.bmp,*.gif,*.png,*.jpeg   " binary images
set wildignore+=*.o,*.obj,*.exe,*.dll,*.manifest " compiled object files
set wildignore+=*.pyc                            " Python byte code
set wildignore+=*.spl                            " compiled spelling word lists
set wildignore+=*.sw?                            " Vim swap files
set wildignore+=*.DS_Store?                      " OSX bullshit
" }}}

" }}}
" UI {{{
" ---------------------------------------------------------------------------

set title
set scrolloff=3
set sidescroll=1
set sidescrolloff=10
set listchars+=precedes:❮,extends:❯
set showbreak=↪
set ruler
set noshowmode
set showcmd
set novisualbell
set backspace=indent,eol,start
set laststatus=2
set virtualedit+=block
set display+=lastline
set ttimeoutlen=20

if has("cscope")
    " use both cscope and ctag for 'ctrl-]', ':ta', and 'vim -t'
    set cscopetag

    " check cscope for definition of a symbol before checking ctags: set to 1
    " if you want the reverse search order.
    set csto=1
endif

" }}}
" Text Formatting {{{
" ---------------------------------------------------------------------------

" Only do this part when compiled with support for autocommands.
if has("autocmd")
  " Enable file type detection.
  " Use the default filetype settings, so that mail gets 'tw' set to 72,
  " 'cindent' is on in C files, etc.
  " Also load indent files, to automatically do language-dependent indenting.
  filetype plugin indent on

  " Insert mode plugins {{{
  " augroup insert_mode_plugins
  "   autocmd!
  "   autocmd InsertEnter * call plug#load('supertab',
  "         \ 'ultisnips', 'vim-snippets', 'vim-endwise',
  "         \ 'vim-repeat', 'vim-sleuth')
  "        " \ 'vim-sleuth', 'supertab', 'syntastic')
  " augroup END
  " }}}

  " Vimscript file settings {{{
  augroup filetype_vim
    autocmd!
    " autocmd FileType vim setlocal foldmethod=marker
    " Use the :help command for 'K' in .vim files
    autocmd FileType vim set keywordprg=":help"
  augroup END
  " }}}

  " text files settings {{{
  augroup filetype_text
    autocmd!
    " For all text files set 'textwidth' to 78 characters.
    autocmd FileType text setlocal textwidth=78
  augroup END
  " }}}

  " ruby files settings {{{
  augroup filetype_ruby
    autocmd!
    " Use # to create string interpolation with vim-surround
    autocmd FileType ruby let b:surround_35 = "#{\r}"

    " Delete trailing spaces from ruby files
    autocmd BufWritePre *.rb :%s/\s\+$//e

    if has("balloon_eval")
      " Annoying plugins keep turning ballooneval on
      autocmd BufEnter *.rb setlocal noballooneval
    endif
  augroup END
  " }}}

  " git commit messages {{{
  augroup filetype_gitcommit
    autocmd!
    " Show Git diff in window split when commiting
    autocmd FileType gitcommit DiffGitCached | wincmd L | wincmd p
    " Spellcheck commit messages
    autocmd FileType gitcommit setlocal spell!
  augroup END
  " }}}

  " command window {{{
  augroup command_window
    autocmd!
    " Have <esc> leave cmdline-window
    autocmd CmdwinEnter * nnoremap <buffer> <ESC> :q<CR>
  augroup END
  " }}}

  " persistent undo {{{
  augroup undo
    autocmd!
    autocmd BufWritePre /tmp/* setlocal noundofile
  augroup END
  " }}}

  " Utilities {{{
  augroup utilities
    autocmd!

    " When editing a file, always jump to the last known cursor position.
    " Don't do it when the position is invalid or when inside an event handler
    " (happens when dropping a file on gvim).
    autocmd BufReadPost *
      \ if line("'\"") > 0 && line("'\"") <= line("$") |
      \   exe "normal g`\"" |
      \ endif

    " Resize splits when the window is resized
    autocmd VimResized * exe "normal! \<c-w>="

    " When vimrc is edited, automatically reload it
    autocmd bufwritepost .vimrc source %
  augroup END
  " }}}

  " Netrw mappings {{{
  augroup netrw_mappings
    autocmd!
    autocmd filetype netrw call Netrw_mappings()
  augroup END
  function! Netrw_mappings()
    map <buffer> h -
    map <buffer> l <CR>
  endfunction
  " }}}
else
  set autoindent		" always set autoindenting on
endif " has("autocmd")

set formatoptions+=n1rj
set expandtab

" }}}
" Status Line {{{
" ---------------------------------------------------------------------------

set statusline=%#warningmsg#
set statusline+=%*
set statusline+=%{fugitive#statusline()}
set statusline+=\ %<%f\ %h%m%r%=%-14.(%l,%c%V%)\ %P
" set statusline+=%{ruby_debugger#statusline()}

" }}}
" Mappings {{{
" ---------------------------------------------------------------------------

" Shortcuts to often edited files
nnoremap <leader>ev :vsplit $MYVIMRC<cr>
nnoremap <leader>ez :vsplit $HOME/.zshrc<cr>
nnoremap <leader>et :vsplit $HOME/.tmux.conf<cr>
nnoremap <leader>es :vsplit $HOME/.ssh/config<cr>

" Toggle settings
nnoremap <leader>sn :set number!<cr>
nnoremap <leader>sr :set relativenumber!<cr>
nnoremap <leader>sw :set wrap!<cr>
nnoremap <silent> <leader>sl :call ToggleCursorline()<cr>
nnoremap <leader>sh :MediumModeToggle<cr>
nnoremap <leader>sp :set paste!<CR>

function! ToggleCursorline()
  let g:cursorline_active = !&cursorline
  set cursorline!
endfunction

let g:cursorline_active = &cursorline
" Highlight cursorline ONLY in the active window
augroup cursor_line
  autocmd!
  autocmd WinEnter * if g:cursorline_active | setlocal cursorline | endif
  autocmd WinLeave * if g:cursorline_active | setlocal nocursorline | endif
augroup END

" Easy copy/paste from system clipboard
vmap <Leader>y "+y
vmap <Leader>d "+d
nmap <Leader>p "+p
nmap <Leader>P "+P
vmap <Leader>p "+p
vmap <Leader>P "+P


" Surround with quotes
nnoremap <leader>" viw<esc>a"<esc>hbi"<esc>lel
nnoremap <leader>' viw<esc>a'<esc>hbi'<esc>lel

" Tabularize
nnoremap <leader>a= :Tabularize /=<cr>
vnoremap <leader>a= :Tabularize /=<cr>
nnoremap <leader>a: :Tabularize /:\zs<cr>
vnoremap <leader>a: :Tabularize /:\zs<cr>

" Easier start/end of line
noremap H ^
noremap L $

" <Ctrl>-d deletes the line
inoremap <c-d> <esc>ddi
" <Ctrl>-u make the current word uppercase
inoremap <c-u> <esc>viwUi

" Center screen when scrolling search results
" nnoremap n nzz
" nnoremap N Nzz

" Move between splits
nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l

" Make something useful from these arrow keys
nmap <Left> <<
nmap <Right> >>
vmap <Left> <gv
vmap <Right> >gv
nmap <Up> [m
nmap <Down> ]m

" Map ESC
inoremap jk <esc>
" inoremap <esc> <nop>

" Expand current file path
cnoremap <expr> %% getcmdtype() == ':' ? expand('%:h').'/' : '%%'

" Stop highlight search
nnoremap <CR> :noh<CR>

map <SPACE> <Plug>(easymotion-s2)
map <Leader>j <Plug>(easymotion-j)
map <Leader>k <Plug>(easymotion-k)

vmap v <Plug>(expand_region_expand)
vmap <C-v> <Plug>(expand_region_shrink)

" Don't use Ex mode, use Q for formatting
noremap Q gq

" Select pasted text
nnoremap <leader>v V`]

" Quick yanking to the end of the line
nmap Y y$

" Just because I'm used to it
nnoremap <c-p> :Files<CR>

" Ack the word under the cursor
nnoremap <leader>a :Ack! <cword><CR>

" Easy completion of method name in insert mode
inoremap <c-x><c-]> <c-]>

" Use . for visual selection
vnoremap . :norm.<CR>

function! s:try(cmd, default)
  if exists(':' . a:cmd) && !v:count
    let tick = b:changedtick
    execute a:cmd
    if tick == b:changedtick
      execute join(['normal!', a:default])
    endif
  else
    execute join(['normal! ', v:count, a:default], '')
  endif
endfunction

nnoremap <silent> J :<C-u>call <SID>try('SplitjoinJoin',  'J')<CR>
nnoremap <silent> S :<C-u>call <SID>try('SplitjoinSplit', "r\015")<CR>

" }}}
" Function Keys {{{
" ---------------------------------------------------------------------------

" <F1> Escape
inoremap <F1> <ESC>
noremap <F1> <ESC>
" <F2> File explorer
noremap <F2> :Explore<CR>
" <F3> Buffer explorer
noremap <F3> :Buffers<CR>
" <F4> Tagbar
noremap <F4> :TagbarToggle<CR>
" <F5> Reload file
noremap <F5> :e!<CR>
" <F7> Toggle GUndo tree
noremap <F7> :GundoToggle<CR>
" <F8> Comment
nmap <F8> <Plug>CommentaryLine<ESC>j
xmap <F8> <Plug>Commentary
" <F9> Remove all trailing spaces
noremap <F9> :let _s=@/<Bar>:%s/\s\+$//e<Bar>:let @/=_s<Bar>:nohl<CR>
" <F10> YankRing
" nnoremap <silent> <F10> :YRShow<cr>
" inoremap <silent> <F10> <ESC>:YRShow<cr>
" <F12> Compile using makefile
noremap <F12> :make<CR>

" }}}
" Plugins Config {{{
" ---------------------------------------------------------------------------

let g:vundle_default_git_proto = 'git'

" Ruby
" let g:rubycomplete_buffer_loading=1
let ruby_space_errors=1

let g:ale_lint_on_text_changed='never'
let g:ale_sign_error='✗'
let g:ale_sign_warning='⚠'
let g:ale_echo_msg_error_str='E'
let g:ale_echo_msg_warning_str='W'
let g:ale_echo_msg_format='[%linter%] %s [%severity%]'

" SuperTab
let g:SuperTabDefaultCompletionType="context"
" let g:SuperTabContextDefaultCompletionType="<c-x><c-o>"
" let g:SuperTabCrMapping=0

" UltiSnips
let g:UltiSnipsExpandTrigger="<tab>"
let g:UltiSnipsJumpForwardTrigger="<tab>"
let g:UltiSnipsJumpBackwardTrigger="<s-tab>"
let g:UltiSnipsEditSplit="vertical"

" SplitJoin
let g:splitjoin_align=1

" Stop yankring from complaining
let g:yankring_manual_clipboard_check=0

" Put tagbar on the left
let g:tagbar_left=1

" Ack
let g:ackprg='ag --nogroup --nocolor --column'
let g:ack_wildignore = 0
let g:ackhighlight=1

" EasyMotion
let g:EasyMotion_smartcase = 1
let g:EasyMotion_use_smartsign_jp = 1

" Clever-f
let g:clever_f_smart_case=1
let g:clever_f_timeout_ms=10000
let g:clever_f_show_prompt=1
let g:clever_f_mark_cursor=1
let g:clever_f_chars_match_any_signs=';:'
let g:clever_f_fix_key_direction=1

" Medium mode
let g:mediummode_enabled = 0
let g:mediummode_allowed_motions = 5

" Airline
let g:airline#extensions#tagbar#enabled=0
let g:airline#extensions#hunks#enabled=0
let g:airline#extensions#ale#enabled=1
let g:airline_theme='twilight'

" Mustache
let g:mustache_abbreviations = 1

" }}}
" GUI {{{
" ---------------------------------------------------------------------------

" Use a line-drawing char for pretty vertical splits.
set fillchars+=vert:│

colorscheme twilight
if has("gui_running")
  " For Win32 GUI: remove 't' flag from 'guioptions': no tearoff menu entries
  " let &guioptions = substitute(&guioptions, "t", "", "g")
  set guioptions-=T " no toolbar
  set guioptions-=m " no menus
  set guioptions-=r " no scrollbar on the right
  set guioptions-=R " no scrollbar on the right
  set guioptions-=L " no scrollbar on the left
  set guioptions-=b " no scrollbar on the bottom
  set mousemodel=popup_setpos

  if has('gui_macvim')
    set guifont=Menlo:h12
    set transparency=15
    set fuoptions=maxvert,maxhorz
  endif
else
  set clipboard=unnamed
  if !has('nvim')
    set ttymouse=sgr
  endif
  set mouse=a
  set t_Co=256
endif

" }}}
" Misc {{{
" ---------------------------------------------------------------------------

" Ensure the temp dirs exist
if !isdirectory($HOME . "/.vim/.tmp")
  call system("mkdir -p ~/.vim/.tmp/backup")
  call system("mkdir -p ~/.vim/.tmp/undo")
  call system("mkdir -p ~/.vim/.tmp/yankring")
  call system("mkdir -p ~/.vim/.tmp/ctrlp")
  call system("mkdir -p ~/.vim/.tmp/netrw")
endif

if has('nvim')
  set viminfo='1000,f1,<500,:100,/100,s10,h
else
  set viminfo='1000,f1,<500,:100,/100,s10,h,n~/.vim/viminfo
endif
set backupdir=~/.vim/.tmp/backup,~/.vim/.tmp,/tmp
set undodir=~/.vim/.tmp/undo,~/.vim/.tmp,/tmp
let g:yankring_history_dir = "~/.vim/.tmp/yankring"
let g:netrw_home = '~/.vim/.tmp/netrw'
let g:notes_directories = ['~/.vim/notes']

set completeopt=menuone,preview
" Make Vim completion popup menu work just like in an IDE
" set completeopt=longest,menuone
" inoremap <expr> <cr> pumvisible() ? "\<c-y>" : "\<c-g>u\<cr>"
" inoremap <expr> <c-n> pumvisible() ? "\<lt>c-n>" : "\<lt>c-n>\<lt>c-r>=pumvisible() ? \"\\<lt>down>\" : \"\"\<lt>cr>"
" inoremap <expr> <m-;> pumvisible() ? "\<lt>c-n>" : "\<lt>c-x>\<lt>c-o>\<lt>c-n>\<lt>c-p>\<lt>c-r>=pumvisible() ? \"\\<lt>down>\" : \"\"\<lt>cr>

" Highlight VCS conflict markers
" match ErrorMsg '^\(<\|=\|>\)\{7\}\([^=].\+\)\?$'


" Scratchpad
function! ScratchEdit(cmd, options)
  exe a:cmd tempname()
  setl buftype=nofile bufhidden=wipe nobuflisted
  if !empty(a:options) | exe 'setl' a:options | endif
endfunction

command! -bar -nargs=* Sedit call ScratchEdit('edit', <q-args>)
command! -bar -nargs=* Ssplit call ScratchEdit('split', <q-args>)
command! -bar -nargs=* Svsplit call ScratchEdit('vsplit', <q-args>)
command! -bar -nargs=* Stabedit call ScratchEdit('tabe', <q-args>)

" vp doesn't replace paste buffer
function! RestoreRegister()
  let @" = s:restore_reg
  return ''
endfunction
function! s:Repl()
  let s:restore_reg = @"
  return "p@=RestoreRegister()\<cr>"
endfunction
vmap <silent> <expr> p <sid>Repl()

" Source a global configuration file if available
if filereadable("/etc/vim/vimrc.local")
  source /etc/vim/vimrc.local
endif

" }}}
