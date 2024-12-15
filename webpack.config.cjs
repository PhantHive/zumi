const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: './client/src/renderer/index.tsx',
    target: 'electron-renderer',
    output: {
        path: path.join(__dirname, 'dist/client/renderer'),
        filename: 'bundle.js',
        publicPath: '/',
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
        new Dotenv({
            path: './.env',
            systemvars: true,
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
                publicPath: '/public',
            },
        ],
        compress: true,
        port: 31275,
        hot: true,
    },
    devtool: 'source-map',
};
