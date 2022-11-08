let express = require("express");
let wordsJSON = require("./words1k.json");
let bcrypt = require("bcrypt");

let app = express();
app.use(express.json());
const PORT = 3000;
const users = [];
const saltRounds = 10;

let http = require("http");
let server = http.createServer(app);

server.listen(PORT, () => {
    console.log("listerning on port 3000");
})

app.use("/", express.static("public/page1"))

let datastore = require("nedb");
let highScoreDB = new datastore({ filename: "highscores.db", timestampData: false });
let usersDB = new datastore({ filename: "userAuth.db", timestampData: false });

highScoreDB.loadDatabase();
usersDB.loadDatabase();
// app.get("/users", (req, res) => {
//     res.json(users);
// })

// app.post("users/login", async (req, res) => {
//     const user = users.find(user => user.userN === req.body.userN)
//     if (user == null) {
//         return res.status(400).send('Cannot find user')
//     }
//     try {
//         if (await bcrypt.compare(req.body.password, user.password)) {
//             res.send('Success')
//         } else {
//             res.send('Not Allowed')
//         }
//     } catch {
//         res.status(500).send()
//     }
// })

let io = require("socket.io");
io = new io.Server(server);


//variables
let tr = 0; //current room number
let rooms = {};
let newRoomFlag = true;


io.sockets.on("connect", (socket) => {

    console.log("New connection:", socket.id);

    //checking disconnection of the specific socket
    socket.on("disconnect", () => {
        console.log("Socket disconnected", socket.id);
        console.log("Room: ", socket.roomNo);
        rooms[socket.roomNo].cap--;
        console.log("Room Capacity: ", rooms[socket.roomNo].cap);
        if (rooms[socket.roomNo].f) {
            console.log("yes buddy");
            io.sockets.to(rooms[socket.roomNo].n).emit("playerDropped");
        }
        if (rooms[socket.roomNo].winners.length >= rooms[socket.roomNo].cap) {
            rooms[socket.roomNo].f = true; //changed
            updateHighscoreDB(rooms[socket.roomNo].winners[0]);
            io.sockets.to(socket.roomNo).emit("winners", rooms[socket.roomNo].winners);
        }
    })

    socket.on("userAuth", (data) => {
        socket.userN = data.username;
        let pswdH;
        let userExistsFlag = false;
        let loginStatusData;


        usersDB.find({ username: data.username }, (err, docs) => {
            if (err) {
                console.log("Error", err);
                userExistsFlag = false;

            }
            else {

                console.log("Docs:", docs);
                if (docs.length > 0) {
                    console.log("entered docs");
                    pswdH = docs[0].password;
                    userExistsFlag = true;
                }
                else {
                    console.log("entered here")
                    userExistsFlag = false;
                }
            }
            console.log(userExistsFlag);

            if (userExistsFlag) {
                console.log("user exists");
                bcrypt.compare(data.pass, pswdH, (err, result) => {
                    if (err) {
                        console.log("Error line 189: ", err);
                    }
                    // result == true
                    else {
                        if (result) {
                            console.log("successful login");
                            loginStatusData = "success";
                            io.sockets.to(socket.id).emit("loginStatus", loginStatusData);
                            //emit a msg back to the specific client that their login was successful
                        }
                        else {
                            console.log("unsuccessful login");
                            loginStatusData = "failed";
                            io.sockets.to(socket.id).emit("loginStatus", loginStatusData);
                            //emit a msg back to the specific client that their login failed and ask them to login again (keep prompting them)
                            //the reason their login failed could be that their username exists already or their password is wrong
                        }
                    }
                });
            }
            else {
                bcrypt.hash(data.pass, saltRounds, (err, hash) => {
                    // Store hash in your password DB.
                    if (err) {
                        console.log("Error line 206: ", err);
                    }
                    usersDB.insert({ username: data.username, password: hash }, (err, newDoc) => {
                        if (err) {
                            console.log("Error line 210:", err);
                        }
                        else {
                            console.log("New user profile created successfully");
                            loginStatusData = "successCreated";
                            highScoreDB.insert({ username: data.username, highscore: 0 }, (err, docs) => {
                                if (err) {
                                    console.log("Error", err);
                                }
                                else {
                                    console.log("Profile created in highscore db");
                                }
                            })
                            io.sockets.to(socket.id).emit("loginStatus", loginStatusData);
                            //emit a msg saying that their user profile is created and they are logged in succesfully (as an alert)
                        }

                    })

                });
            }

        })
        // console.log(userExistsFlag);

        // if (userExistsFlag) {
        //     console.log("user exists");
        //     bcrypt.compare(data.pass, pswdH, (err, result) => {
        //         if (err) {
        //             console.log("Error: ", err);
        //         }
        //         // result == true
        //         else {
        //             if (result) {
        //                 console.log("successful login");
        //             }
        //             else {
        //                 console.log("unsuccessful login");
        //             }
        //         }
        //     });
        // }
        // else {
        //     bcrypt.hash(data.pass, saltRounds, (err, hash) => {
        //         // Store hash in your password DB.
        //         if (err) {
        //             console.log("Error: ", err);
        //         }
        //         usersDB.insert({ username: data.username, password: hash }, (err, newDoc) => {
        //             if (err) {
        //                 console.log("Error:", err);
        //             }
        //             else {
        //                 console.log("New user profile created successfully");
        //             }

        //         })

        //     });
        // }

    })

    //reference: https://sebhastian.com/javascript-wait-for-function-to-finish/

    for (let i = 1; i <= tr; i++) {
        if (rooms[i].cap < 4 && rooms[i].f) {
            socket.roomNo = rooms[i].n;
            rooms[i].cap++;
            newRoomFlag = false;
            if (rooms[i].cap > 3) {
                io.sockets.to(rooms[i].n).emit("roomFull");
            }
            break;
        }
        else {
            // let a = rooms[i].n;
            // console.log(a);
            if (rooms[i].f) {
                io.sockets.to(rooms[i].n).emit("roomFull");
            }
            newRoomFlag = true;
        }
    }
    if (newRoomFlag) {
        if (tr != 0) {
            io.sockets.to(rooms[tr].n).emit("roomFull");
        }
        tr++;
        socket.roomNo = tr;
        newRoomFlag = false;
        rooms[tr] = { n: tr, f: true, cap: 1, winners: [], positions: {} };
    }
    socket.join(socket.roomNo);
    if (rooms[socket.roomNo].cap > 3) {
        io.sockets.to(socket.roomNo).emit("roomFull");
    }
    console.log("Room Capacity: ", rooms[socket.roomNo].cap);
    io.sockets.to(socket.roomNo).emit("roomData", socket.roomNo);

    socket.on("raceReady", () => {
        words = ""
        for (let i = 0; i < 20; i++) {
            if (i == 19) {
                words = words + wordsJSON.words[Math.floor(Math.random() * (1000)) + 1]; //without space in the end
                break;
            }
            words = words + wordsJSON.words[Math.floor(Math.random() * (1000)) + 1] + " ";
        }
        rooms[socket.roomNo].f = false;
        io.sockets.to(socket.roomNo).emit("startRace", words);
    })

    socket.on("indexUpdate", (data) => {
        rooms[socket.roomNo].positions[data.username] = data.posI;
        let count = 1;
        let others = []
        for (let key in rooms[socket.roomNo].positions) {
            if (key != data.username && rooms[socket.roomNo].positions[key] > rooms[socket.roomNo].positions[data.username]) {
                count++;

            }
            if (key != data.username) {
                others.push(rooms[socket.roomNo].positions[key]);
            }

        }
        let positionUpdateData = {
            racePos: count,
            othersPos: others
        }
        io.sockets.to(socket.id).emit("positionUpdate", positionUpdateData);
    })

    socket.on("raceFinish", (data) => {
        rooms[socket.roomNo].winners.push(data);
        console.log(rooms[socket.roomNo].winners);
        if (rooms[socket.roomNo].winners.length >= rooms[socket.roomNo].cap) {
            rooms[socket.roomNo].f = true; //changed
            updateHighscoreDB(rooms[socket.roomNo].winners[0]);
            io.sockets.to(socket.roomNo).emit("winners", rooms[socket.roomNo].winners);
        }
    })


})


function updateHighscoreDB(winner) {

    highScoreDB.find({ username: winner }, (err, docs) => {
        let prevScore;
        if (err) {
            console.log("Error:", err);
        }
        else {
            prevScore = docs[0].highscore;
            console.log(prevScore);
        }
        highScoreDB.update({ highscore: prevScore }, { $set: { highscore: prevScore + 1 } }, { upsert: false }, (err, numReplaced) => {
            // numReplaced = 3
            // Field 'system' on Mars, Earth, Jupiter now has value 'solar system'
            if (err) {
                console.log("Error:", err);
            }
        });
    })

}