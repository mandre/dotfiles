local colors = {
    bg = '#282c34',
    fg = '#aab2bf',
    section_bg = '#38393f',
    blue = '#61afef',
    green = '#98c379',
    purple = '#c678dd',
    orange = '#e5c07b',
    red1 = '#e06c75',
    red2 = '#be5046',
    yellow = '#e5c07b',
    gray1 = '#5c6370',
    gray2 = '#2c323d',
    gray3 = '#3e4452',
    darkgrey = '#5c6370',
    grey = '#848586',
    middlegrey = '#8791A5'
}

local theme = {
  normal = {
    a = { fg = colors.bg, bg = colors.green, gui = 'bold' },
    b = { fg = colors.fg, bg = colors.section_bg },
    c = { fg = colors.middlegrey, bg = colors.bg },
    y = { fg = colors.middlegrey, bg = colors.bg },
    z = { fg = colors.gray2, bg = colors.blue },
  },
  insert = {
    a = { fg = colors.bg, bg = colors.blue, gui = 'bold' },
    b = { fg = colors.fg, bg = colors.section_bg },
    c = { fg = colors.middlegrey, bg = colors.bg },
    y = { fg = colors.middlegrey, bg = colors.bg },
    z = { fg = colors.gray2, bg = colors.blue },
  },
  visual = {
    a = { fg = colors.bg, bg = colors.purple, gui = 'bold' },
    b = { fg = colors.fg, bg = colors.section_bg },
    c = { fg = colors.middlegrey, bg = colors.bg },
    y = { fg = colors.middlegrey, bg = colors.bg },
    z = { fg = colors.gray2, bg = colors.blue },
  },
  replace = {
    a = { fg = colors.bg, bg = colors.red1, gui = 'bold' },
    b = { fg = colors.fg, bg = colors.section_bg },
    c = { fg = colors.middlegrey, bg = colors.bg },
    y = { fg = colors.middlegrey, bg = colors.bg },
    z = { fg = colors.gray2, bg = colors.blue },
  },
  inactive = {
    a = { fg = colors.color5, bg = colors.color2, gui = 'bold' },
    b = { fg = colors.fg, bg = colors.section_bg },
    c = { fg = colors.middlegrey, bg = colors.bg },
  },
}

vim.api.nvim_set_hl(0, "DiagnosticErrorStatus", { bg=colors.bg, fg=colors.red1 })
vim.api.nvim_set_hl(0, "DiagnosticWarnStatus", { bg=colors.bg, fg=colors.orange })
vim.api.nvim_set_hl(0, "DiagnosticInfoStatus", { bg=colors.bg, fg=colors.blue })
vim.api.nvim_set_hl(0, "DiagnosticHintStatus", { bg=colors.bg, fg=colors.blue })

vim.api.nvim_set_hl(0, "DiffAddStatus", { bg=colors.bg, fg=colors.green })
vim.api.nvim_set_hl(0, "DiffChangeStatus", { bg=colors.bg, fg=colors.orange })
vim.api.nvim_set_hl(0, "DiffDeleteStatus", { bg=colors.bg, fg=colors.red1 })

require('lualine').setup {
  options = {
    icons_enabled = true,
    theme = theme,
    component_separators = '',
    section_separators = '',
    disabled_filetypes = {
      statusline = {},
      winbar = {},
    },
    ignore_focus = {},
    always_divide_middle = true,
    always_show_tabline = true,
    globalstatus = false,
    refresh = {
      statusline = 100,
      tabline = 100,
      winbar = 100,
    }
  },
  sections = {
    lualine_a = {'mode'},
    lualine_b = {
      {
        'filetype',
        colored = false,
        icon_only = true,
        padding = { left = 1, right = 0 },
      },
      {
        'filename',
        file_status = true,
        symbols = {
          modified = '  ',
          readonly = '  ',
        },
        separator = { right = ''},
      },
    },
    lualine_c = {
      {
        'diagnostics',
        -- sources = { 'nvim_lsp' },
        sections = { 'error', 'warn', 'info', 'hint' },
        diagnostics_color = {
          error = 'DiagnosticErrorStatus',
          warn  = 'DiagnosticWarnStatus',
          info  = 'DiagnosticInfoStatus',
          hint  = 'DiagnosticHintStatus',
        },
        symbols = {error = ' ', warn = ' ', info = ' ', hint = ' '},
        colored = true,
        update_in_insert = false,
        always_visible = false,
      },
    },
    lualine_x = {
      {
        'diff',
        colored = true,
        diff_color = {
          added    = 'DiffAddStatus',
          modified = 'DiffChangeStatus',
          removed  = 'DiffDeleteStatus',
        },
        symbols = {added = ' ', modified = ' ', removed = ' '},
      },
      {
        'lsp_status',
        symbols = {
          spinner = { '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' },
          done = '✓',
          separator = ' ',
        },
      },
      { 'codecompanion' },
      { "vim.fn['zoom#statusline']()" },
      {'branch', icon = ''},
    },
    lualine_y = {'location'},
    lualine_z = {'progress'},
  },
  inactive_sections = {
    lualine_a = {},
    lualine_b = {
      {
        'filetype',
        colored = false,
        icon_only = true,
        padding = { left = 1, right = 0 },
      },
      {
        'filename',
        file_status = true,
        symbols = {
          modified = '  ',
          readonly = '  ',
        },
        separator = { right = ''},
      },
    },
    lualine_c = {},
    lualine_x = {},
    lualine_y = {},
    lualine_z = {}
  },
  tabline = {},
  winbar = {},
  inactive_winbar = {},
  extensions = {}
}
