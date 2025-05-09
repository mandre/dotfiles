" Preamble {{{
" ---------------------------------------------------------------------------

" Automatically install vim-plug if it isn't installed
let data_dir = has('nvim') ? stdpath('data') . '/site' : '~/.vim'
if empty(glob(data_dir . '/autoload/plug.vim'))
  silent execute '!curl -fLo '.data_dir.'/autoload/plug.vim --create-dirs  https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim'
  autocmd VimEnter * PlugInstall --sync | source $MYVIMRC
endif

" }}}
" Plugins {{{
" ---------------------------------------------------------------------------

call plug#begin(stdpath('data') . '/plugged')

" Programming
Plug 'liuchengxu/vista.vim',       { 'on': 'Vista' }

" Snippets
" Plug 'SirVer/ultisnips' ",        { 'on': [] }
" Plug 'honza/vim-snippets' ",      { 'on': [] }

" Git
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-rhubarb'
Plug 'lewis6991/gitsigns.nvim'

Plug 'nvim-lua/popup.nvim'
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-telescope/telescope.nvim'

" Ruby
" Plug 'tpope/vim-rails',         { 'for': 'ruby' }

" Utility
Plug 'bogado/file-line'
Plug 'ConradIrwin/vim-bracketed-paste'
Plug 'tpope/vim-endwise'
Plug 'tpope/vim-repeat'
Plug 'tpope/vim-sleuth'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-unimpaired'
Plug 'tpope/vim-eunuch'
Plug 'windwp/nvim-autopairs'
Plug 'nvim-neo-tree/neo-tree.nvim'
Plug 'MunifTanjim/nui.nvim'
Plug 'mileszs/ack.vim'
Plug 'mbbill/undotree',             { 'on': 'UndotreeToggle'   }
Plug 'whiteinge/diffconflicts'
Plug 'junegunn/fzf', { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'ggandor/leap.nvim'
Plug 'numToStr/Navigator.nvim'
Plug 'terryma/vim-expand-region', { 'on': ['<Plug>(expand_region_expand)', '<Plug>(expand_region_shrink)'] }
Plug 'AndrewRadev/splitjoin.vim'
" Plug 'godlygeek/tabular',       { 'on': 'Tabularize' }
" Plug 'wellle/targets.vim'
" Plug 'vim-scripts/LargeFile'
" Plug 'vim-scripts/ZoomWin'

Plug 'neovim/nvim-lspconfig'
Plug 'hrsh7th/cmp-nvim-lsp'
Plug 'hrsh7th/cmp-buffer'
Plug 'hrsh7th/cmp-path'
Plug 'hrsh7th/cmp-calc'
Plug 'hrsh7th/cmp-emoji'
Plug 'hrsh7th/nvim-cmp'

Plug 'nvim-lualine/lualine.nvim'
Plug 'nvim-tree/nvim-web-devicons'
Plug 'mhartington/oceanic-next'

Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}

call plug#end()

lua require("statusline")
lua require("lsp")
lua require("completion")
lua require('gitsigns').setup()

syntax enable
if (has("termguicolors"))
 set termguicolors
endif

lua << EOF
require'nvim-treesitter.configs'.setup {
  highlight = {
    enable = true
  },
}

require('neo-tree').setup({
  window = {
    position = "float",
    mappings = {
      ["h"] = "close_node",
      ["l"] = "open",
    },
  },
  filesystem = {
    filtered_items = {
      visible = true,
      hide_dotfiles = false,
    },
  },
})


require('Navigator').setup({
    disable_on_zoom = true
})

require "nvim-autopairs".setup{}
require('leap')
vim.keymap.set({'n', 'x', 'o'}, 's',  '<Plug>(leap-forward)')
vim.keymap.set({'n', 'o'}, 'S',  '<Plug>(leap-backward)')
vim.keymap.set({'n', 'x', 'o'}, 'gs', '<Plug>(leap-from-window)')
EOF

" }}}
" General {{{
" ---------------------------------------------------------------------------

let mapleader = ","
let g:mapleader = ","
set history=50
set hidden
set confirm
set nobackup
set nowritebackup
set noswapfile
set undofile
set smarttab
set shiftround

" set number
" set relativenumber
set cursorline

" Match and search
set ignorecase
set smartcase
set showmatch
set inccommand=nosplit


" Spell
if has("spell")
  " set spelllang=fr
  set spelllang=en_us
  nnoremap <leader>ss :set spell!<CR>
endif

" Terminal {{{
" Make escape work in the Neovim terminal
tnoremap <Esc> <C-\><C-n>

" Make navigation into and out of Neovim terminal splits nicer
tnoremap <C-h> <C-\><C-N><C-w>h
tnoremap <C-j> <C-\><C-N><C-w>j
tnoremap <C-k> <C-\><C-N><C-w>k
tnoremap <C-l> <C-\><C-N><C-w>l
" }}}

" Relative numbers when in normal mode
autocmd TermOpen * setlocal conceallevel=0 colorcolumn=0 relativenumber

" Start terminal in insert mode
autocmd TermOpen term://* startinsert

" }}}
" UI {{{
" ---------------------------------------------------------------------------

" set title
set scrolloff=3
set sidescrolloff=10
set listchars+=precedes:❮,extends:❯
set showbreak=↪
set noshowmode
set virtualedit+=block
set ttimeoutlen=20


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

  " go files settings {{{
  augroup filetype_go
    autocmd!
    autocmd BufWritePre *.go lua vim.lsp.buf.format()
    autocmd BufWritePre *.go lua go_org_imports()
  augroup END
  " }}}

  " tf files settings {{{
  augroup filetype_tf
    autocmd!
    autocmd BufNewFile,BufRead *.tf set filetype=hcl
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
    autocmd bufwritepost .config/nvim/init-0.5.vim source %

    " Highlight yanked text
    autocmd TextYankPost * lua vim.highlight.on_yank {higroup="IncSearch", timeout=150, on_visual=true}
  augroup END
  " }}}
endif

set formatoptions+=n1rj
set expandtab

" }}}
" Mappings {{{
" ---------------------------------------------------------------------------

" Shortcuts to often edited files
nnoremap <leader>ev :vsplit $HOME/.config/nvim/init-0.5.vim<cr>
nnoremap <leader>ez :vsplit $HOME/.zshrc<cr>
nnoremap <leader>et :vsplit $HOME/.tmux.conf<cr>
nnoremap <leader>es :vsplit $HOME/.ssh/config<cr>

" Toggle settings
nnoremap <leader>sn :set number!<cr>
nnoremap <leader>sr :set relativenumber!<cr>
nnoremap <leader>sw :set wrap!<cr>
nnoremap <silent> <leader>sl :call ToggleCursorline()<cr>
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
" nnoremap <leader>a= :Tabularize /=<cr>
" vnoremap <leader>a= :Tabularize /=<cr>
" nnoremap <leader>a: :Tabularize /:\zs<cr>
" vnoremap <leader>a: :Tabularize /:\zs<cr>

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

" Move between splits, transparently with tmux
nnoremap <silent> <C-h> :lua require('Navigator').left()<cr>
nnoremap <silent> <C-j> :lua require('Navigator').down()<cr>
nnoremap <silent> <C-k> :lua require('Navigator').up()<cr>
nnoremap <silent> <C-l> :lua require('Navigator').right()<cr>

" Make something useful from these arrow keys
nmap <Left> <<
nmap <Right> >>
vmap <Left> <gv
vmap <Right> >gv
nmap <Up> [m
nmap <Down> ]m

" Map ESC
inoremap jk <esc>
inoremap kj <esc>
" inoremap <esc> <nop>

" Expand current file path
cnoremap <expr> %% getcmdtype() == ':' ? expand('%:h').'/' : '%%'

" Stop highlight search
nnoremap <CR> :noh<CR>

map <SPACE> <Plug>(leap)

vmap v <Plug>(expand_region_expand)
vmap <C-v> <Plug>(expand_region_shrink)

" Don't use Ex mode, use Q for formatting
noremap Q gq

" Select pasted text
nnoremap <leader>v V`]

" Quick yanking to the end of the line
nmap Y y$

" Just because I'm used to it
nnoremap <c-p> <cmd>Telescope find_files<cr>

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
" nnoremap <silent> S :<C-u>call <SID>try('SplitjoinSplit', "r\015")<CR>

" }}}
" Function Keys {{{
" ---------------------------------------------------------------------------

" <F1> Escape
inoremap <F1> <ESC>
noremap <F1> <ESC>
" <F2> File explorer
noremap <F2> :Neotree toggle reveal<CR>
" <F3> Buffer explorer
noremap <F3> <cmd>Telescope buffers<cr>
" <F4> Vista
noremap <F4> :Vista!!<CR>
" <F5> Reload file
noremap <F5> :e!<CR>
" <F7> Toggle Undo tree
noremap <F7> :UndotreeToggle<CR>
" <F8> Comment
nmap <F8> gcc<ESC>j
xmap <F8> gc<ESC>
" <F9> Remove all trailing spaces
noremap <F9> :let _s=@/<Bar>:%s/\s\+$//e<Bar>:let @/=_s<Bar>:nohl<CR>
" <F12> Compile using makefile
noremap <F12> :make<CR>

" }}}
" Plugins Config {{{
" ---------------------------------------------------------------------------

" Ruby
" let g:rubycomplete_buffer_loading=1
let ruby_space_errors=1

" UltiSnips
" let g:UltiSnipsExpandTrigger="<tab>"
" let g:UltiSnipsJumpForwardTrigger="<tab>"
" let g:UltiSnipsJumpBackwardTrigger="<s-tab>"
" let g:UltiSnipsEditSplit="vertical"

" SplitJoin
let g:splitjoin_align=1

" Vista
let g:vista_default_executive = 'nvim_lsp'
let g:vista_sidebar_position = 'vertical topleft'
let g:vista_disable_statusline = 1

" Ack
let g:ackprg='ag --vimgrep'
let g:ackhighlight=1

" Mustache
let g:mustache_abbreviations = 1

" Undotree
let g:undotree_WindowLayout = 2

" }}}
" GUI {{{
" ---------------------------------------------------------------------------

" Use a line-drawing char for pretty vertical splits.
set fillchars+=vert:│

" colorscheme twilight
let g:oceanic_next_terminal_italic=1
let g:oceanic_next_terminal_bold=1
colorscheme OceanicNext

hi Normal guibg=NONE ctermbg=NONE
hi LineNr guibg=NONE ctermbg=NONE
hi SignColumn guibg=NONE ctermbg=NONE
hi EndOfBuffer guibg=NONE ctermbg=NONE
hi WinSeparator  guifg=#38393f   guibg=NONE

" LSP
hi LspDiagnosticsDefaultError             guifg=#ec5f67 ctermfg=203
hi LspDiagnosticsDefaultWarning           guifg=#e5c07b ctermfg=221
hi LspDiagnosticsDefaultInformation       guifg=#6699cc ctermfg=68
hi LspDiagnosticsDefaultHint              guifg=#5F5A60 ctermfg=68

" GitSigns
hi GitSignsAdd               guifg=#99c794 ctermfg=114  gui=bold cterm=bold
hi GitSignsChange            guifg=#e5c07b ctermfg=68   gui=bold cterm=bold
hi GitSignsDelete            guifg=#ec5f67 ctermfg=203  gui=bold cterm=bold

" Diff
hi DiffAdd        guifg=#99c794 ctermfg=114 guibg=#343d46 ctermbg=237 gui=none cterm=none
hi DiffChange     guifg=#65737e ctermfg=243 guibg=#343d46 ctermbg=237 gui=none cterm=none
hi DiffDelete     guifg=#ec5f67 ctermfg=203 guibg=#343d46 ctermbg=237 gui=none cterm=none
hi DiffText       guifg=#6699cc ctermfg=68 guibg=#343d46 ctermbg=237 gui=none cterm=none
hi DiffAdded      guifg=#99c794 ctermfg=114 guibg=none ctermbg=none gui=none cterm=none
hi DiffRemoved    guifg=#ec5f67 ctermfg=203 guibg=none ctermbg=none gui=none cterm=none
hi DiffFile       guifg=#fac863 ctermfg=221 guibg=none ctermbg=none gui=none cterm=none
hi DiffNewFile    guifg=#fac863 ctermfg=221 guibg=none ctermbg=none gui=none cterm=none
hi DiffLine       guifg=#6699cc ctermfg=68 guibg=none ctermbg=none gui=none cterm=none

" NeoTree
hi NeoTreeFloatBorder   guifg=#38393f guibg=#181818
hi NeoTreeTitleBar      guifg=#aab2bf guibg=#38393f

set mouse=a

" }}}
" Misc {{{
" ---------------------------------------------------------------------------


set shada='1000,f1,<500,:100,/100,s10,h
" set backupdir=~/.vim/.tmp/backup,~/.vim/.tmp,/tmp
" set undodir=~/.vim/.tmp/undo,~/.vim/.tmp,/tmp

" Set completeopt to have a better completion experience
set completeopt=menuone,noinsert,noselect

" Avoid showing message extra message when using completion
set shortmess+=c

" Highlight VCS conflict markers
" match ErrorMsg '^\(<\|=\|>\)\{7\}\([^=].\+\)\?$'


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
" }}}
