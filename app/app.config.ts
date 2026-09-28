export default defineAppConfig({
  // https://ui.nuxt.com/getting-started/theme#design-system
  ui: {
    colors: {
      primary: 'bordeaux',
      secondary: 'tangerine',
      success: 'emerald',
      neutral: 'mulberry',
    },
    button: {
      slots: {
        base: 'press rounded-sketch cursor-pointer disabled:cursor-not-allowed font-semibold',
      },
      compoundVariants: [
        { variant: 'solid', class: 'ring-2 ring-inset ring-(--ink-fixed)/85' },
        { color: 'secondary', variant: 'solid', class: 'text-(--ink-fixed) hover:bg-secondary-300' },
      ],
    },
    input: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
    },
    select: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
    },
    textarea: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
    },
    inputNumber: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
    },
    card: {
      slots: {
        header: 'p-2 sm:px-2 md:p-4',
        body: 'p-2 sm:p-2 md:p-4',
        footer: 'p-2 sm:px-2 md:p-4',
      },
    },
  },
})
