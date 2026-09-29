export default defineAppConfig({
  // https://ui.nuxt.com/getting-started/theme#design-system
  ui: {
    tv: {
      twMergeConfig: {
        extend: { classGroups: { rounded: ['rounded-sketch'] } },
      },
    },
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
      variants: {
        size: {
          lg: { base: 'py-3' },
          xl: { base: 'px-4 py-3 text-lg' },
        },
      },
      compoundVariants: [
        { size: 'lg', square: true, class: 'p-3 justify-center' },
        { variant: 'solid', class: 'ring-2 ring-inset ring-(--ink-fixed)/85' },
        { color: 'secondary', variant: 'solid', class: 'text-(--ink-fixed) hover:bg-secondary-300' },
      ],
    },
    input: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        size: {
          lg: { base: 'py-3' },
        },
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
      compoundVariants: [
        { highlight: true, class: 'ring-2' },
      ],
    },
    select: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        size: {
          lg: { base: 'py-3' },
        },
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
      compoundVariants: [
        { highlight: true, class: 'ring-2' },
      ],
    },
    textarea: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        size: {
          lg: { base: 'py-3' },
        },
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
      compoundVariants: [
        { highlight: true, class: 'ring-2' },
      ],
    },
    inputNumber: {
      slots: {
        base: 'rounded-sketch sketch-field',
      },
      variants: {
        size: {
          lg: { base: 'py-3' },
        },
        variant: {
          outline: 'text-highlighted bg-default ring-2 ring-inset ring-(--ink)/35',
        },
      },
      compoundVariants: [
        { highlight: true, class: 'ring-2' },
      ],
    },
    chip: {
      variants: {
        size: {
          '3xl': 'h-4 min-w-4 text-xs',
        },
        color: {
          secondary: 'text-(--ink-fixed)',
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
