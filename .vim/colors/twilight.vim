" Vim color scheme
"
" Name:        twilight.vim
" Maintainer:  Jonathan Rudenberg <jonathan@titanous.com> 
" License:     MIT
"
" A GUI only vim theme based on the Twilight TextMate theme.
" Original structure taken from railscasts.vim [1].
" Some parts of this theme were borrowed from the well-documented Lucius theme [2].
"
" [1] http://github.com/jpo/vim-railscasts-theme
" [2] http://www.vim.org/scripts/script.php?script_id=2536

set background=dark
hi clear
if exists("syntax_on")
  syntax reset
endif
let g:colors_name = "twilight"

hi Normal                    guifg=#F8F8F8 guibg=#000000 ctermfg=231 ctermbg=16
hi Cursor                    guibg=#fffd00 ctermbg=226 
hi CursorLine                guibg=#212628 ctermbg=235
hi LineNr                    guifg=#888888 guibg=#DEDEDE ctermfg=102 ctermbg=253
hi Visual                    guibg=#404040 ctermbg=237
hi Directory                 guifg=#7587A6 gui=NONE cterm=NONE ctermfg=67
hi SpecialKey                guifg=#4C4C4C ctermfg=239
hi NonText                   guifg=#4C4C4C gui=NONE cterm=NONE ctermfg=239
hi MatchParen                guibg=#7587A6 ctermbg=67
hi ErrorMsg                  guifg=#F8F8F8 guibg=#B22518 ctermfg=231 ctermbg=124
hi WarningMsg                guifg=#B22518 ctermfg=124
hi Search                    guifg=#FFFFFF guibg=#075D7F ctermfg=231 ctermbg=24
hi MoreMsg                   guifg=#619518 ctermfg=2
hi Question                  guifg=#359926 ctermfg=2
hi WildMenu                  guibg=#E9C062 ctermbg=179
hi Title                     guifg=#FFFFFF ctermfg=231

hi StatusLine                guifg=#303030 guibg=#babdb6 gui=NONE cterm=NONE ctermfg=236 ctermbg=250
hi StatusLineNC              guifg=#babdb6 guibg=#303030 gui=NONE cterm=NONE ctermfg=250 ctermbg=236
hi VertSplit                 guifg=#babdb6 guibg=#303030 gui=NONE cterm=NONE ctermfg=250 ctermbg=236

" Popup Menu
hi Pmenu                     guifg=#605958 guibg=#303030 gui=NONE cterm=NONE ctermfg=240 ctermbg=236
hi PmenuSel                  guifg=#a09998 guibg=#404040 gui=NONE cterm=NONE ctermfg=247 ctermbg=238

" Folding
hi Folded                    guifg=#99B1D8 guibg=#4C4C4C ctermfg=110 ctermbg=239
hi FoldColumn                guifg=#99B1D8 guibg=Grey40 ctermfg=110 ctermbg=241

" rubyRegexp*
hi link rubyRegexp           Special
hi link rubyRegexpSpecial    rubyRegexpEscape
hi link rubyRegexpDelimiter  Special
hi Special                   guifg=#E9C062 ctermfg=179
hi rubyRegexpEscape          guifg=#CF7D34 ctermfg=173

"rubyComment
hi Comment                   guifg=#5F5A60 gui=italic ctermfg=240
hi Todo                      guifg=#E3D796 guibg=NONE gui=bold cterm=bold ctermfg=186 ctermbg=NONE

"rubyPseudoVariable
"nil, self, symbols, etc
hi Constant                  guifg=#CF6A4C ctermfg=130
hi rubyConstant              guifg=#9B859D ctermfg=139

"rubyClass, rubyModule, rubyDefine
"def, end, include, etc
hi Define                    guifg=#CDA869 ctermfg=179

"rubyInterpolation
hi link rubyInterpolationDelimiter rubyInterpolation
hi Delimiter                 guifg=#F9EE98 ctermfg=228
hi rubyInterpolation         guifg=#DAEFA3 ctermfg=193

"rubyError, rubyInvalidVariable
hi Error                     guifg=#F8F8F8 guibg=#562D56 ctermfg=231 ctermbg=238

"rubyFunction
hi link rubyModuleDeclaration Function
hi link rubyClassDeclaration Function
hi                           Function guifg=#9B703F gui=NONE cterm=NONE ctermfg=65

"rubyIdentifier
"@var, @@var, $var, etc
hi Identifier                guifg=#7587A6 gui=NONE cterm=NONE ctermfg=67

"rubyInclude
"include, autoload, extend, load, require
hi Include                   guifg=#CDA869 gui=NONE cterm=NONE ctermfg=179

"rubyKeyword, rubyKeywordAsMethod
"alias, undef, super, yield, callcc, caller, lambda, proc
hi Keyword                   guifg=#CDA869 ctermfg=179

" same as define
hi Macro                     guifg=#CDA869 gui=NONE cterm=NONE ctermfg=179

"rubyInteger
hi Number                    guifg=#CF6A4C ctermfg=130

" #if, #else, #endif
hi PreCondit                 guifg=#CDA869 gui=NONE cterm=NONE ctermfg=179

" generic preprocessor
hi PreProc                   guifg=#8996A8 gui=NONE cterm=NONE ctermfg=67

"rubyControl, rubyAccess, rubyEval
"case, begin, do, for, if unless, while, until else, etc.
hi Statement                 guifg=#CDA869 gui=NONE cterm=NONE ctermfg=179

"rubyString
hi link rubyStringDelimiter  String
hi link rubyStringEscape     Delimiter
hi String                    guifg=#8F9D6A ctermfg=107

hi Type                      guifg=#7587A6 gui=NONE cterm=NONE ctermfg=67

" Diffs
hi DiffText                  guifg=#F8F8F8 guibg=#0E2231 gui=italic ctermfg=231 ctermbg=234
hi DiffAdd                   guifg=#F8F8F8 guibg=#253B22 ctermfg=231 ctermbg=236
hi DiffDelete                guifg=#F8F8F8 guibg=#420E09 gui=NONE cterm=NONE ctermfg=231 ctermbg=52
hi DiffChange                guifg=#F8F8F8 guibg=#4A410D ctermfg=231 ctermbg=58

" HTML
hi link xmlTag               HtmlTag
hi link xmlTagName           HtmlTagName
hi link xmlEndTag            HtmlEndTag
hi link HtmlTagName          HtmlTag
hi link HtmlEndTag           HtmlTag
hi link HtmlSpecialChar      Constant
hi HtmlTag                   guifg=#CDA869 ctermfg=179
hi HtmlArg                   guifg=#F9EE98 ctermfg=228

" HAML
hi link hamlId               hamlClass
hi link hamlClass            hamlTag
hi link hamlAttributesHash   Operator
hi hamlTag                   guifg=#F9EE98 ctermfg=228

" Javascript
hi link javaScript           Normal
hi link javascriptType       Keyword
hi jQuery                    guifg=#9B859D ctermfg=139

" SASS
hi link sassId               sassClass
hi link cssFunctionName      Type
hi StorageClass              guifg=#F8F8F8 ctermfg=231
hi sassMixing                guifg=#9B5C2E ctermfg=94
hi sassClass                 guifg=#F9EE98 ctermfg=228
