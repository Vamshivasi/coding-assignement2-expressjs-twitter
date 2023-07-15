const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`Db Error ${error.message}`);
  }
};

initializeDbAndServer();

// JwtToken Verification
const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};
//  Register User API-1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `select * from user where username ='${username}'`;
  console.log(username, password, name, gender);
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            insert into 
                user(name, username, password, gender)
            values(
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
            )
                ;`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
// user login api-2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username ='${username}';`;
  console.log(username, password);
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched == true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// user Tweets Feed API -3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const getTweetFeedQuery = `
    select 
        username, 
        tweet,
        date_time as dateTime
    from 
        follower inner join tweet on follower.following_user_id = tweet.user_id inner join user on user.user_id = follower.following_user_id
    where 
        follower.follower_user_id= ${user_id}
    order by 
        date_time desc
    limit 4 
        ;`;
  const tweetFeedArray = await db.all(getTweetFeedQuery);
  response.send(tweetFeedArray);
});

//get user following  namesAPI -4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowsQuery = `
    select 
        name 
    from 
        user inner join follower on user.user_id = follower.following_user_id
    where 
        follower.follower_user_id = ${user_id}
    ;`;
  const userFollowsArray = await db.all(userFollowsQuery);
  response.send(userFollowsArray);
});

// get user names followers api -5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowerQuery = `
    select 
        name
    from
        user inner join follower on user.user_id = follower.follower_user_id
    where 
        follower.following_user_id =${user_id}
    ;`;
  const userFollowersArray = await db.all(userFollowerQuery);
  response.send(userFollowersArray);
});

// get tweet api - 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, tweetId);
  const tweetQuery = `select * from tweet where tweet_id = ${tweetId};`;
  const tweetResult = await db.get(tweetQuery);
  //response.send(tweetResult)
  const userFollowersQuery = `
    select 
        * 
    from follower inner join user on user.user_id = follower.following_user_id
    where 
        follower.follower_user_id = ${user_id}
    ;`;
  const userFollowers = await db.all(userFollowersQuery);
  //response.send(userFollowers)
  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    console.log(tweetResult);
    console.log("- - - -  - - - - - -");
    console.log(userFollowers);
    const getTweetDetailsQuery = `
        select 
            tweet,
            count(distinct(like.like_id)) as likes,
            count(distinct(reply.reply_id)) as replies,
            tweet.date_time as dateTime
        from 
            tweet inner join like on tweet.tweet_id = like.tweet_id inner join reply on reply.tweet_id = tweet.tweet_id 
        where 
            tweet.tweet_id = ${tweetId} and tweet.user_id =${userFollowers[0].user_id}
        ;`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
// get Tweet Liked Users API-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    console.log(name, tweetId);
    const getLikedUserQuery = `
    select 
        *
    from 
        follower inner join tweet on tweet.user_id = follower.following_user_id inner join like on like.tweet_id = tweet.tweet_id
        inner join user on user.user_id = like.user_id
    where 
        tweet.tweet_id =${tweetId} and follower.follower_user_id = ${user_id}
    ;`;
    const likedUser = await db.all(getLikedUserQuery);
    console.log(likedUser);
    if (likedUser.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUser) => {
        for (let item of likedUser) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUser);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//get tweet replaied users api -8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    console.log(name, tweetId);
    const getRepliedUsersQuery = `
    select 
        * 
    from 
        follower inner join tweet  on tweet.user_id = follower.following_user_id inner join reply on reply.tweet_id =  tweet.tweet_id
        inner join user on user.user_id = reply.user_id 
    where 
        tweet.tweet_id =${tweetId} and follower.follower_user_id = ${user_id}
    ;`;
    const repliedUsers = await db.all(getRepliedUsersQuery);
    console.log(repliedUsers);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// get all tweet of user ap - 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, user_id);
  const getTweetDetailsQuery = `
    select 
        tweet.tweet As tweet,
        count(distinct(like.like_id)) as likes,
        count(distinct(reply.reply_id)) as replies,
        tweet.date_time as dateTime
    from 
        user inner join tweet on user.user_id = tweet.user_id inner join like on like.tweet_id = tweet.tweet_id inner join reply on reply.tweet_id = tweet.tweet_id
    where 
        user.user_id =${user_id}
    group by 
        tweet.tweet_id
            ;`;
  const tweetDetails = await db.all(getTweetDetailsQuery);
  response.send(tweetDetails);
});

//get Post Tweet api 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, tweetId);
  const postTweetQuery = `
    insert into 
        tweet (tweet, user_id)
    values(
        '${tweet}',
        ${user_id}
    )
    ;`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});
// delete tweet api -11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const selectUserQuery = `select * from tweet where tweet.user_id =${user_id} and tweet.tweet_id =${tweetId};`;
    const tweetUser = await db.all(selectUserQuery);
    if (tweetUser.length !== 0) {
      const deleteTweetQuery = `
        delete from tweet 
        where 
            tweet.user_id =${user_id} and tweet.tweet_id = ${tweetId}
        ;`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
