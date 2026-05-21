vim.lsp.enable({'pyright', 'gopls', 'bashls', 'terraformls'})
vim.lsp.inlay_hint.enable()

-- Global mappings.
-- See `:help vim.diagnostic.*` for documentation on any of the below functions
vim.keymap.set('n', '<space>e', vim.diagnostic.open_float)
vim.keymap.set('n', '[d', function() vim.diagnostic.jump({ count = -1 }) end)
vim.keymap.set('n', ']d', function() vim.diagnostic.jump({ count = 1 }) end)
vim.keymap.set('n', '<space>q', vim.diagnostic.setloclist)


local x = vim.diagnostic.severity
vim.diagnostic.config({
  virtual_lines = {
   -- Only show virtual line diagnostics for the current cursor line
   current_line = true,
  },
  -- virtual_text = { prefix = "" },

  signs = { text = { [x.ERROR] = " ", [x.WARN] = " ", [x.INFO] = " ", [x.HINT] = " " } },
})

-- Use LspAttach autocommand to only map the following keys
-- after the language server attaches to the current buffer
vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('UserLspConfig', {}),
  callback = function(ev)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[ev.buf].omnifunc = 'v:lua.vim.lsp.omnifunc'

    -- Buffer local mappings.
    -- See `:help vim.lsp.*` for documentation on any of the below functions
    local opts = { buffer = ev.buf }
    vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, opts)
    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts)
    vim.keymap.set('n', 'ga', vim.lsp.buf.code_action, opts)
    vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)
    vim.keymap.set('n', 'gi', vim.lsp.buf.implementation, opts)
    vim.keymap.set('n', '<S-k>', vim.lsp.buf.signature_help, opts)
    vim.keymap.set('n', '<space>wa', vim.lsp.buf.add_workspace_folder, opts)
    vim.keymap.set('n', '<space>wr', vim.lsp.buf.remove_workspace_folder, opts)
    vim.keymap.set('n', '<space>wl', function()
      print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, opts)
    vim.keymap.set('n', '<space>D', vim.lsp.buf.type_definition, opts)
    vim.keymap.set('n', '<space>rn', vim.lsp.buf.rename, opts)
    vim.keymap.set('n', 'gr', vim.lsp.buf.references, opts)
    vim.keymap.set('n', '<space>f', function()
      vim.lsp.buf.format { async = true }
    end, opts)

    -- Set autocommands conditional on server_capabilities
    -- if client.server_capabilities.documentHighlightProvider then
    --   vim.cmd [[
    --   hi! LspReferenceRead cterm=bold gui=bold ctermbg=237 guibg=#343d46
    --   hi! LspReferenceText cterm=bold gui=bold ctermbg=237 guibg=#343d46
    --   hi! LspReferenceWrite cterm=bold gui=bold ctermbg=237 guibg=#343d46
    --   ]]
    --   vim.api.nvim_create_augroup('lsp_document_highlight', {
    --     clear = false
    --   })
    --   vim.api.nvim_clear_autocmds({
    --     buffer = bufnr,
    --     group = 'lsp_document_highlight',
    --   })
    --   vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
    --     group = 'lsp_document_highlight',
    --     buffer = bufnr,
    --     callback = vim.lsp.buf.document_highlight,
    --   })
    --   vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
    --     group = 'lsp_document_highlight',
    --     buffer = bufnr,
    --     callback = vim.lsp.buf.clear_references,
    --   })
    -- end
  end,
})

function go_org_imports(wait_ms)
  local clients = vim.lsp.get_clients({ bufnr = 0, method = "textDocument/codeAction" })
  for _, client in ipairs(clients) do
    local params = vim.lsp.util.make_range_params(0, client.offset_encoding)
    params.context = {only = {"source.organizeImports"}}
    local result = client:request_sync("textDocument/codeAction", params, wait_ms, 0)
    for _, r in pairs((result or {}).result or {}) do
      if r.edit then
        vim.lsp.util.apply_workspace_edit(r.edit, { offset_encoding = client.offset_encoding })
      end
    end
  end
end
