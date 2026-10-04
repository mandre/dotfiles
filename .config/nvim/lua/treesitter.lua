-- Parsers to make sure are installed (names as known by nvim-treesitter)
local parsers = {
  'markdown', 'markdown_inline',
  'go', 'python', 'bash',
  'lua', 'vim', 'vimdoc',
  'hcl',
}

-- Filetypes to enable treesitter highlighting/indent on (vim filetype names,
-- which don't always match the parser name above: e.g. bash -> sh,
-- vimdoc -> help, markdown_inline is only used via injection).
local filetypes = {
  'markdown', 'go', 'python', 'sh',
  'lua', 'vim', 'help', 'hcl',
}

require('nvim-treesitter').install(parsers)

vim.api.nvim_create_autocmd('FileType', {
  pattern = filetypes,
  callback = function()
    vim.treesitter.start()
    vim.wo[0][0].foldexpr = 'v:lua.vim.treesitter.foldexpr()'
    vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
  end,
})
