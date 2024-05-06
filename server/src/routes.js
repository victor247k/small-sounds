const express = require('express');
const path = require('path');
const utils = require('./utils.js');
const bcrypt = require('bcrypt');
const fs = require('fs');
const uploadImage = require('./uploadImage.js');
const uploadSong = require('./uploadSong.js');
const { body, validationResult } = require('express-validator');


const db = require('./database');

const router = express.Router();


router.get('/', (req, res) => {
    if (!req.session.isLoggedIn && !req.cookies.loggedIn) {
        res.render('home', { loged: false });
        return;
    } else {
        // User is logged in
        const username = req.session.username || req.cookies.username;

        db.all('SELECT * FROM users WHERE username = ?', username, (selectionError, user) => {
            if (selectionError) {
                console.error('Error selecting data:', selectionError.message);
                res.status(500).send('Internal Server Error');
                return;
            }

            if (user.length === 0) {
                // User not found
                console.error('User not found');
                res.status(404).send('User not found');
                return;
            }

            db.all('SELECT * FROM profile WHERE user_id = ?', user[0].user_id, (profileSelectionError, profile) => {
                if (profileSelectionError) {
                    console.error('Error selecting data:', profileSelectionError.message);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                if (profile.length === 0) {
                    // Profile not found
                    console.error('Profile not found');
                    res.status(404).send('Profile not found');
                    return;
                }

                const src = profile[0].picture || "/images/default_profile.png";

                res.render('home', { username: username, src: src, loged: true });
            });
        });
    }
});

router.get('/signin', (req, res) => {
    res.render('sign', { sign: "in" });
});

router.get('/signup', (req, res) => {
    res.render('sign', { sign: "up" });
});

router.post('/signup', [
    body('email').isEmail().withMessage('Invalid email format')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send(errors.array().map(error => error.msg).join('<br>'));
    }
    const email = req.body.email;
    const username = req.body.username;
    const password = req.body.password;

    if (!utils.ValidateEmail(email)) {
        res.send("Invalid email <br> <a href=\"/signup\">Go Back!</a>");
        return;
    }
    if (password.length < 8) {
        res.send("Password too short<br> <a href=\"/signup\">Go Back!</a>");
        return;
    }


    db.all('SELECT * FROM users WHERE username = ?', username, (err, rows) => {
        if (err) {
            console.error('Error selecting data:', err.message);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Check if username already exists
        if (rows.length !== 0) {
            res.send("Username already exists<br> <a href=\"/signup\">Go Back!</a>");
        } else {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) {
                    console.error('Error generating hash:', err.message);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Insert user into users table
                db.run('INSERT INTO users (username, email, hash, joined) VALUES (?, ?, ?, ?)', [username, email, hash, (new Date()).toDateString()], function (err) {
                    if (err) {
                        console.error('Error inserting data into users table:', err.message);
                        res.status(500).send('Internal Server Error');
                        return;
                    }

                    // Get the user_id of the inserted user
                    const user_id = this.lastID;

                    // Insert profile for the user
                    db.run('INSERT INTO profile (user_id, markdown, picture) VALUES (?, ?, ?)', [user_id, `../media/users/${username}/README.md`, "/images/default_profile.png"], function (err) {
                        if (err) {
                            console.error('Error inserting data into profile table:', err.message);
                            res.status(500).send('Internal Server Error');

                            db.run('DELETE FROM users WHERE user_id = ?', user_id, (deletionError) => {
                                console.log(deletionError);
                            });

                            return;
                        }

                        // Create user directory and README file
                        fs.mkdir(path.join(__dirname, `../media/users/${username}`), (error) => {
                            if (error) {
                                console.error('Error creating directory:', error.message);
                                res.status(500).send('Internal Server Error');
                                utils.removeFolderRecursive(path.join(__dirname, `../media/users/${username}`));
                                return;
                            } else {
                                const content = utils.GetContent(username);
                                fs.writeFileSync(path.join(__dirname, `../media/users/${username}/README.md`), content);
                                res.redirect('/signup');
                            }
                        });
                    });
                });
            });
        }
    });
});

router.post('/signin', (req, res) => {
    const auth = req.body.username;
    const password = req.body.password;

    // Check if input is an email or username
    const field = utils.ValidateEmail(auth) ? "email" : "username";

    if (field == 'username') {
        db.all('SELECT * FROM users WHERE username = ?', auth, (err, rows) => {
            if (err) {
                console.error('Error selecting data:', err.message);
                return res.status(500).send('Internal Server Error');
            }

            if (rows.length === 0) {
                return res.send("User not found<br> <a href=\"/signin\">Go Back!</a>");
            }

            bcrypt.compare(password, rows[0].hash, (err, result) => {
                if (err) {
                    console.error('Error comparing passwords:', err.message);
                    return res.status(500).send('Internal Server Error');
                }

                if (result) {
                    req.session.isLoggedIn = true;
                    req.session.username = rows[0].username;
                    res.cookie('loggedIn', true, { httpOnly: true, secure: true });
                    res.cookie('username', rows[0].username, { httpOnly: true, secure: true });
                    return res.redirect('/');
                } else {
                    return res.send("Passwords do not match<br> <a href=\"/signin\">Go Back!</a>");
                }
            });
        });
    } else {
        db.all('SELECT * FROM users WHERE email = ?', auth, (err, rows) => {
            if (err) {
                console.error('Error selecting data:', err.message);
                return res.status(500).send('Internal Server Error');
            }
            console.log(rows);

            if (rows.length === 0) {
                return res.send("User not found<br> <a href=\"/signin\">Go Back!</a>");
            }

            bcrypt.compare(password, rows[0].hash, (err, result) => {
                if (err) {
                    console.error('Error comparing passwords:', err.message);
                    return res.status(500).send('Internal Server Error');
                }

                if (result) {
                    req.session.isLoggedIn = true;
                    req.session.username = rows[0].username;
                    res.cookie('loggedIn', true, { maxAge: 900000, httpOnly: true, secure: true });
                    res.cookie('username', rows[0].username, { maxAge: 900000, httpOnly: true, secure: true });
                    return res.redirect('/');
                } else {
                    return res.send("Passwords do not match<br> <a href=\"/signin\">Go Back!</a>");
                }
            });
        });
    }
});


router.get('/signout', (req, res) => {
    // Clear session
    req.session.destroy();
    // Clear login cookie
    res.clearCookie('loggedIn');
    res.clearCookie('username');
    res.redirect('/'); 
});

router.get('/dashboard', (req, res) => {
    if (req.session.isLoggedIn || req.cookies.loggedIn) {
        // User is logged in
        // Proceed with rendering the dashboard
        const username = req.session.username || req.cookies.username;

        db.all('SELECT * FROM users WHERE username = ?', username, (err, user) => {
            if (err) {
                console.error('Error selecting data:', err.message);
                res.status(500).send('Internal Server Error');
                return;
            }

            if (user.length === 0) {
                // User not found
                console.error('User not found');
                res.status(404).send('User not found');
                return;
            }

            db.all('SELECT * FROM profile WHERE user_id = ?', user[0].user_id, (er, profile) => {
                if (er) {
                    console.error('Error selecting data:', er.message);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                if (profile.length === 0) {
                    // Profile not found
                    console.error('Profile not found');
                    res.status(404).send('Profile not found');
                    return;
                }

                const song = profile[0].song ? profile[0].song : undefined;
                const src = profile[0].picture || "/images/default_profile.png";
                const content = fs.readFileSync(path.join(__dirname, profile[0].markdown), 'utf-8');

                res.render('dashboard', { username: username, src: src, content: content });
            });
        });

    } else {
        // User is not logged in
        // Redirect to login page or show an error message
        res.redirect('/login');
    }
});

router.post('/uploadProfilePicture', (req, res, next) => {
    if (!req.session.isLoggedIn && !req.cookies.loggedIn) {
        res.redirect('/login');
        return;
    }
    const username = req.session.username || req.cookies.username;
    uploadImage(req, res, (uploadingError) => {
        if (uploadingError) {
            console.error('Error uploading image:', uploadingError.message);
            res.status(500).send('Internal Server Error');
            return;
        }
        const filename = req.file.filename;
        db.all('SELECT * FROM users WHERE username = ?', username, (userError, user) => {
            if (userError) {
                console.error('Error selecting data:', userError.message);
                res.status(500).send('Internal Server Error');
                return;
            }
            db.all('SELECT * FROM profile WHERE user_id = ?', user[0].user_id, (selectingError, profile) => {
                if (selectingError) {
                    console.error('Error selecting data:', selectingError.message);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                if (profile[0].picture != "/images/default_profile.png") {
                    fs.unlink(path.join(__dirname, "../media/", profile[0].picture), (unlinkingError) => {
                        if (unlinkingError) {
                            console.error('Error removing file:', unlinkingError);
                            return;
                        }
                        console.log('File removed successfully');
                    });
                }

            });
            db.run('UPDATE profile SET picture = ? WHERE user_id = ?', [`/images/${filename}`, user[0].user_id], (updatingError) => {
                if (updatingError) {
                    console.error('Error updating data into profile table:', updatingError.message);
                    res.status(500).send('Internal Server Error');

                    fs.unlink(path.join(__dirname, "../media/images/", filename), (unlinkingError) => {
                        if (unlinkingError) {
                            console.error('Error removing file:', unlinkingError);
                            return;
                        }
                        console.log('File removed successfully');
                    });

                    return;
                }
                res.redirect('/dashboard');
            })
        })
    });
});
router.post('/updateProfileReadme', (req, res) => {
    if (req.session.isLoggedIn || req.cookies.loggedIn) {
        const content = req.body.readme;
        const username = req.session.username || req.cookies.username;
        fs.writeFileSync(path.join(__dirname, `../media/users/${username}/README.md`), content);
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});


router.post('/postSong', (req, res, next) => {
    if (req.session.isLoggedIn || req.cookies.loggedIn) {
        const username = req.session.username || req.cookies.username;
        uploadSong(req, res, (uploadingError) => {
            if (uploadingError) {
                console.error('Error uploading image:', uploadingError.message);
                res.status(500).send('Internal Server Error');
                return;
            } else {
                const title = req.body.title;
                const type = req.body.post_type;

                const genre = req.body.genre;
                const instrument = req.body.instrument;
                const description = req.body.description;

                if (title == "" || title === undefined) {
                    res.send("Title empty <br> <a href=\"/postSong\">Go Back!</a>");
                    return;
                }
                if (type !== "cover" && type !== "original") {
                    res.send("Not good post type<br> <a href=\"/postSong\">Go Back!</a>");
                    console.log(type);
                    return;
                }
                if (utils.genres.indexOf(genre) === -1) {
                    res.send("Genre not found<br> <a href=\"/postSong\">Go Back!</a>");
                    return;
                }
                if (utils.instruments.indexOf(instrument) === -1) {
                    res.send("Instrument not found<br> <a href=\"/postSong\">Go Back!</a>");
                    return;
                }

                const filename = req.file.filename;
                db.all('SELECT * FROM users WHERE username = ?', username, (selectingError, user) => {
                    if (selectingError) {
                        console.error('Error selecting data:', selectingError.message);
                        res.status(500).send('Internal Server Error');
                        fs.unlink(path.join(__dirname, "../media/songs/", filename), (unlinkingError) => {
                            if (unlinkingError) {
                                console.error('Error removing file:', unlinkingError);
                                return;
                            }
                            console.log('File removed successfully');
                        });
                        return;
                    } else {
                        db.run('INSERT INTO posts (user_id, file_name, post_type, genre, instrument, description, title) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [user[0].user_id, `/songs/${filename}`, type, genre || '', instrument || '', description || '', title], (insertingError) => {
                                if (insertingError) {
                                    console.error('Error inserting data:', insertingError.message);
                                    res.status(500).send('Internal Server Error');
                                    fs.unlink(path.join(__dirname, "../media/songs/", filename), (unlinkingError) => {
                                        if (unlinkingError) {
                                            console.error('Error removing file:', unlinkingError);
                                            return;
                                        }
                                        console.log('File removed successfully');
                                    });
                                    return;
                                } else {
                                    res.send("Song uploaded succesfully!<br> <a href=\"/dashboard\">Go to Dashboard!</a>");
                                }
                            })
                    }
                });
            }
        });
    } else {
        res.redirect('/login');
    }
});

router.post('/removeSong', (req, res) => {
    if (req.session.isLoggedIn || req.cookies.loggedIn) {
        const username = req.session.username || req.cookies.username;
        const title = req.body.title;
        const password = req.body.password;
        if (title === undefined || title === "") {
            res.send("Title empty <br> <a href=\"/removeSong\">Go Back!</a>");
            return;
        }
        if (password === undefined || password === "") {
            res.send("Password empty <br> <a href=\"/removeSong\">Go Back!</a>");
            return;
        }

        db.all('SELECT * FROM users WHERE username = ?', username, (selectingError, user) => {
            if (selectingError) {
                console.error('Error selecting data:', selectingError.message);
                res.status(500).send('Internal Server Error');
                return;
            }

            // Check if any rows were returned
            if (user.length === 0) {
                res.send("Username not found<br> <a href=\"/dashboard\">Go Back!</a>");
                return;
            } else {
                bcrypt.compare(password, user[0].hash, (comparingError, result) => {
                    if (comparingError) {
                        console.log('Error comparing passwords:', comparingError.message);
                        res.status(500).send('Internal Server Error');
                        return;
                    } else {
                        if (result) {
                            db.all('SELECT * FROM posts WHERE title = ? AND user_id = ?', [title, user[0].user_id], (postsSelectingError, posts) => {
                                if (postsSelectingError) {
                                    console.error('Error selecting data:', postsSelectingError.message);
                                    res.status(500).send('Internal Server Error');
                                    return;
                                }
                                if (posts.length === 0) {
                                    res.send("Song not found<br> <a href=\"/removeSong\">Go Back!</a>");
                                    return;
                                } else {
                                    db.run('DELETE FROM posts WHERE post_id = ?', post[0].post_id, (removingError) => {
                                        if (removingError) {
                                            console.error('Error removing data:', removingError.message);
                                            res.status(500).send('Internal Server Error');
                                            return;
                                        } else {
                                            fs.unlinkSync(path.join(__dirname, '../media/', posts[0].file_name));
                                            console.log("File removed succesfuly!");
                                            res.send("Song removed succesfully!<br> <a href=\"/dashboard\">Go to Dashboard!</a>");
                                        }
                                    });
                                }
                            });
                        } else {
                            res.send("Passwords do not match<br> <a href=\"/removeSong\">Go Back!</a>");
                            return;
                        }
                    }
                });
            }
        });
    } else {
        res.redirect('/login');
    }
});

module.exports = router;