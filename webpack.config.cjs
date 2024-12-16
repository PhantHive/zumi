const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
// const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const dotenv = require('dotenv');

// Load env vars
const result = dotenv.config();
if (result.error) {
    console.error('Error loading .env file:', result.error);
    process.exit(1);
}

const env = result.parsed;
console.log('Building with environment variables:', {
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ? 'defined' : 'undefined',
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ? 'defined' : 'undefined'
});

const isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: './client/src/renderer/index.tsx',
    target: 'electron-renderer',
    output: {
        path: path.join(__dirname, 'dist/client/renderer'),
        filename: 'bundle.js',
        publicPath: isDevelopment ? '/' : './',
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            '@babel/preset-react',
                            '@babel/preset-typescript',
                        ],
                    },
                },
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.scss$/,
                use: ['style-loader', 'css-loader', 'sass-loader'],
            }
        ],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: 'Zumi Music Player',
            filename: 'index.html',
            inject: true,
            template: path.join(__dirname, 'client/src/renderer/index.html'),
        }),
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify(process.env.NODE_ENV),
                GOOGLE_CLIENT_ID: JSON.stringify(env.GOOGLE_CLIENT_ID),
                GOOGLE_CLIENT_SECRET: JSON.stringify(env.GOOGLE_CLIENT_SECRET),
                JWT_SECRET: JSON.stringify(env.JWT_SECRET),
                STORE_ENCRYPTION_KEY: JSON.stringify(env.STORE_ENCRYPTION_KEY),
            }
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: 'public',
                    to: 'public',
                },
            ],
        }),
    ],
    devServer: {
        static: [
            {
                directory: path.join(__dirname, 'dist/client/renderer'),
            },
            {
                directory: path.join(__dirname, 'public'),
                publicPath: isDevelopment ? '/public' : '../public'
            },
        ],
        compress: true,
        port: 31275,
        hot: true,
    },
    devtool: isDevelopment ? 'source-map' : false,
};
