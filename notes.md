# thinking
* edited images will have a unique content identifier from their original photo
* I don't want duplicate photos. so, if there are multiple of the same content identifier, I want them gone

data structures to make: 
```
media_obj                       // name of object should be a normalized version filename like fileName_jpg
{
    "-filepath",
    "-FileName",
    "-createdate",
    "-contentidentifier",
    "-livephotovideoindex",
    "-runtimescale",
}
```
```
matches = {                     //loop thru objects and get contentIds and fill into dict
    "content_identifier_1" : {
        images : [media_obj_1, media_obj_2]
        videos : [media_obj_3, media_obj_4]
        complete: bool True/False
    }
}

// TODO: figure out how to handle case where there are multiple images/videos with the same contentId. 
    - one way would be to mark contentId's that have been serviced. probably fastest
    - another way is once match is done, you can remove the entries from the list in the dict. maybe slow

regular_img = {FileNames}       //put images without content_id here 

```

# workspace
```
exiftool -T -contentidentifier -livephotovideoindex -runtimescale me/ > out.txt

exiftool -T -csv -filepath -contentidentifier -livephotovideoindex -runtimescale -r me/ > out.txt


taken:			oct 4
edited:			oct 25
transferred: 	oct 26

JPG
* MacOS-MD Item Content Creation Date

MOV
* QuickTime-Create Date
* 	gives the date that the edit happened

```