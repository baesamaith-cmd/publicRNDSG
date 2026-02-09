/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./dashboard/**/*.{html,js}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                primary: '#6366f1', // Indigo 500
                secondary: '#64748b', // Slate 500
            }
        },
    },
    plugins: [],
}
