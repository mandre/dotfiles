" Normal mode
let s:N1 = [ '#080808' , '#d0d0d0' , 232 , 252 ]
let s:N2 = [ '#d0d0d0' , '#444444' , 252 , 238 ]
let s:N3 = [ '#d0d0d0' , '#242321' , 252 , 235 ]
let s:N4 = [ '#87af5f' , 107 ]

" Insert mode
let s:I1 = [ '#080808' , '#ffd75f' , 232 , 221 ]
let s:I2 = [ '#d0d0d0' , '#444444' , 252 , 238 ]
let s:I3 = [ '#ffd75f' , '#242321' , 221 , 235 ]

" Visual mode
let s:V1 = [ '#080808' , '#5f87af' , 232 , 67 ]
let s:V2 = [ '#d0d0d0' , '#444444' , 252 , 238 ]
let s:V3 = [ '#d0d0d0' , '#242321' , 252 , 235 ]

" Replace mode
let s:RE = [ '#af87af' , 139 ]

" Paste mode
let s:PA = [ '#af5f00' , 130 ]

let s:file = [ '#ff7400' , '' , 196 , '' , '' ]
let s:IA = [ s:N2[1], s:N3[1], s:N2[3], s:N3[3], '' ]	

let g:airline#themes#twilight#palette = {}
let g:airline#themes#twilight#palette.inactive = {
      \ 'airline_a' : [ s:N2[1] , s:N3[1] , s:N2[3] , s:N3[3] , '' ] }


let g:airline#themes#twilight#palette.normal = airline#themes#generate_color_map(s:N1, s:N2, s:N3, s:file)
let g:airline#themes#twilight#palette.normal_modified = {
      \ 'airline_c' : [ s:N4[0] , s:N3[1] , s:N4[1] , s:N3[3] , '' ] }


let g:airline#themes#twilight#palette.insert = airline#themes#generate_color_map(s:I1, s:I2, s:I3, s:file)
let g:airline#themes#twilight#palette.insert_modified = {
      \ 'airline_c' : [ s:N4[0] , s:N3[1] , s:N4[1] , s:N3[3] , '' ] }
let g:airline#themes#twilight#palette.insert_paste = {
      \ 'airline_a' : [ s:I1[0] , s:PA[0] , s:I1[2] , s:PA[1] , '' ],
      \ 'airline_z' : [ s:I1[0] , s:PA[0] , s:I1[2] , s:PA[1] , '' ], }


let g:airline#themes#twilight#palette.replace = copy(airline#themes#twilight#palette.insert)
let g:airline#themes#twilight#palette.replace.airline_a = [ s:I1[0] , s:RE[0] , s:I1[2] , s:RE[1] , '' ]
let g:airline#themes#twilight#palette.replace.airline_z = [ s:I1[0] , s:RE[0] , s:I1[2] , s:RE[1] , '' ]
let g:airline#themes#twilight#palette.replace_modified = g:airline#themes#twilight#palette.insert_modified


let g:airline#themes#twilight#palette.visual = airline#themes#generate_color_map(s:V1, s:V2, s:V3, s:file)
let g:airline#themes#twilight#palette.visual_modified = {
      \ 'airline_c' : [ s:N4[0] , s:V3[1] , s:N4[1] , s:V3[3] , '' ] }

let g:airline#themes#twilight#palette.inactive = airline#themes#generate_color_map(s:IA, s:IA, s:IA, s:file)

